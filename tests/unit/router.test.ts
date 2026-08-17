import { describe, it, expect, vi, beforeEach } from 'vitest'

// router.ts imports lib/supabase/admin, which imports the 'server-only'
// package, a Next.js build-time guard with nothing to resolve outside a Next
// bundle. routeInbound never needs a real admin client: every call it makes
// with the return value of createAdminClient() goes straight into
// hasOpenGuestDraft/handleGuestRequest, which are mocked below too, so the
// admin client itself can be an opaque stub. Same family of pattern as
// tests/unit/hub-resolver-sync.test.ts and advance-doc-type.test.ts, but
// mocking the module directly rather than stubbing 'server-only', since
// nothing here needs the real createAdminClient at all.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }))

vi.mock('@/lib/comms/templates/itinerary', () => ({ renderItinerary: vi.fn() }))
vi.mock('@/lib/comms/templates/travel', () => ({ renderTravel: vi.fn() }))
vi.mock('@/lib/comms/templates/hotel', () => ({ renderHotel: vi.fn() }))
vi.mock('@/lib/comms/templates/crew', () => ({ renderCrew: vi.fn() }))
vi.mock('@/lib/comms/templates/guest-list', () => ({ renderGuestList: vi.fn() }))
vi.mock('@/lib/comms/guest-request', () => ({
  handleGuestRequest: vi.fn(),
  hasOpenGuestDraft: vi.fn(),
}))

import { routeInbound, type RouterInput } from '@/lib/comms/router'
import { renderItinerary } from '@/lib/comms/templates/itinerary'
import { renderTravel } from '@/lib/comms/templates/travel'
import { renderHotel } from '@/lib/comms/templates/hotel'
import { renderCrew } from '@/lib/comms/templates/crew'
import { renderGuestList } from '@/lib/comms/templates/guest-list'
import { handleGuestRequest, hasOpenGuestDraft } from '@/lib/comms/guest-request'

const TOUR_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'

function input(over: Partial<RouterInput> = {}): RouterInput {
  return {
    from_number: '+447700900000',
    body: '',
    tour_id: TOUR_ID,
    person_id: PERSON_ID,
    channel: 'whatsapp',
    ...over,
  }
}

// REE-230. routeInbound is the zero-AI dispatch layer between an inbound
// WhatsApp/Telegram message and the five slash-command template renders, the
// open-guest-draft flow, and the AI fallback. Nothing here calls a model:
// pinning the dispatch keeps a routing regression (a command silently falling
// through to the AI, or a plain reply not landing on an open guest draft)
// from being invisible until a crew member notices no reply arrived.
describe('routeInbound', () => {
  beforeEach(() => {
    vi.mocked(hasOpenGuestDraft).mockReset().mockResolvedValue(false)
    vi.mocked(handleGuestRequest).mockReset()
    vi.mocked(renderItinerary).mockReset()
    vi.mocked(renderTravel).mockReset()
    vi.mocked(renderHotel).mockReset()
    vi.mocked(renderCrew).mockReset()
    vi.mocked(renderGuestList).mockReset()
  })

  describe('slash commands route to their matching render function', () => {
    it('/itinerary calls renderItinerary(person_id, tour_id)', async () => {
      vi.mocked(renderItinerary).mockResolvedValue('itinerary reply')
      const result = await routeInbound(input({ body: '/itinerary' }))
      expect(renderItinerary).toHaveBeenCalledWith(PERSON_ID, TOUR_ID)
      expect(result).toEqual({ action: 'template', reply: 'itinerary reply' })
    })

    it('/travel calls renderTravel(person_id, tour_id)', async () => {
      vi.mocked(renderTravel).mockResolvedValue('travel reply')
      const result = await routeInbound(input({ body: '/travel' }))
      expect(renderTravel).toHaveBeenCalledWith(PERSON_ID, TOUR_ID)
      expect(result).toEqual({ action: 'template', reply: 'travel reply' })
    })

    it('/hotel calls renderHotel(person_id, tour_id)', async () => {
      vi.mocked(renderHotel).mockResolvedValue('hotel reply')
      const result = await routeInbound(input({ body: '/hotel' }))
      expect(renderHotel).toHaveBeenCalledWith(PERSON_ID, TOUR_ID)
      expect(result).toEqual({ action: 'template', reply: 'hotel reply' })
    })

    it('/crew calls renderCrew(tour_id) alone', async () => {
      vi.mocked(renderCrew).mockResolvedValue('crew reply')
      const result = await routeInbound(input({ body: '/crew' }))
      expect(renderCrew).toHaveBeenCalledWith(TOUR_ID)
      expect(renderCrew).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ action: 'template', reply: 'crew reply' })
    })

    it('/guestlist calls renderGuestList(person_id, tour_id)', async () => {
      vi.mocked(renderGuestList).mockResolvedValue('guestlist reply')
      const result = await routeInbound(input({ body: '/guestlist' }))
      expect(renderGuestList).toHaveBeenCalledWith(PERSON_ID, TOUR_ID)
      expect(result).toEqual({ action: 'template', reply: 'guestlist reply' })
    })
  })

  describe('/guest', () => {
    it('strips the command word and one following space, and forwards the rest as text', async () => {
      vi.mocked(handleGuestRequest).mockResolvedValue({ reply: 'guest reply', outcome: 'submitted' })
      const result = await routeInbound(
        input({ body: '/guest Dave Smith dave@example.test +2', channel: 'telegram' })
      )
      expect(handleGuestRequest).toHaveBeenCalledWith(expect.anything(), {
        tourId: TOUR_ID,
        personId: PERSON_ID,
        channel: 'telegram',
        text: 'Dave Smith dave@example.test +2',
      })
      expect(result).toEqual({ action: 'template', reply: 'guest reply' })
    })

    it('trims surrounding whitespace off the command line before stripping', async () => {
      vi.mocked(handleGuestRequest).mockResolvedValue({ reply: 'guest reply', outcome: 'submitted' })
      await routeInbound(input({ body: '   /guest   Dave Smith   ' }))
      expect(handleGuestRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ text: 'Dave Smith' })
      )
    })
  })

  describe('case-insensitive matching', () => {
    it('/ITINERARY routes the same as /itinerary', async () => {
      vi.mocked(renderItinerary).mockResolvedValue('itinerary reply')
      const result = await routeInbound(input({ body: '/ITINERARY' }))
      expect(renderItinerary).toHaveBeenCalledWith(PERSON_ID, TOUR_ID)
      expect(result).toEqual({ action: 'template', reply: 'itinerary reply' })
    })

    it('/Travel routes the same as /travel', async () => {
      vi.mocked(renderTravel).mockResolvedValue('travel reply')
      const result = await routeInbound(input({ body: '/Travel' }))
      expect(renderTravel).toHaveBeenCalledWith(PERSON_ID, TOUR_ID)
      expect(result).toEqual({ action: 'template', reply: 'travel reply' })
    })
  })

  describe('command boundary matching', () => {
    it('recognises a command followed by trailing content after a space', async () => {
      vi.mocked(renderHotel).mockResolvedValue('hotel reply')
      const result = await routeInbound(input({ body: '/hotel please' }))
      expect(renderHotel).toHaveBeenCalledWith(PERSON_ID, TOUR_ID)
      expect(result).toEqual({ action: 'template', reply: 'hotel reply' })
    })

    it('does not match a string that merely starts with the command letters without a space boundary', async () => {
      // '/hotelfoo' must fall through to the AI path, not be misrecognised as /hotel.
      const result = await routeInbound(input({ body: '/hotelfoo' }))
      expect(renderHotel).not.toHaveBeenCalled()
      expect(result).toEqual({ action: 'ai', reply: null })
    })
  })

  describe('unrecognised free text with no open guest draft', () => {
    it('returns the AI action and calls nothing else', async () => {
      vi.mocked(hasOpenGuestDraft).mockResolvedValue(false)
      const result = await routeInbound(input({ body: 'what time is soundcheck' }))
      expect(result).toEqual({ action: 'ai', reply: null })
      expect(renderItinerary).not.toHaveBeenCalled()
      expect(renderTravel).not.toHaveBeenCalled()
      expect(renderHotel).not.toHaveBeenCalled()
      expect(renderCrew).not.toHaveBeenCalled()
      expect(renderGuestList).not.toHaveBeenCalled()
      expect(handleGuestRequest).not.toHaveBeenCalled()
    })
  })

  describe('open guest draft', () => {
    it('routes plain free text to handleGuestRequest with the whole raw body when a draft is open', async () => {
      vi.mocked(hasOpenGuestDraft).mockResolvedValue(true)
      vi.mocked(handleGuestRequest).mockResolvedValue({ reply: 'draft reply', outcome: 'asking' })
      const result = await routeInbound(input({ body: 'yes please', channel: 'whatsapp' }))
      expect(hasOpenGuestDraft).toHaveBeenCalledWith(expect.anything(), TOUR_ID, PERSON_ID)
      expect(handleGuestRequest).toHaveBeenCalledWith(expect.anything(), {
        tourId: TOUR_ID,
        personId: PERSON_ID,
        channel: 'whatsapp',
        text: 'yes please',
      })
      expect(result).toEqual({ action: 'template', reply: 'draft reply' })
    })

    it('does not check for an open draft when the body is a recognised slash command', async () => {
      vi.mocked(renderItinerary).mockResolvedValue('itinerary reply')
      await routeInbound(input({ body: '/itinerary' }))
      expect(hasOpenGuestDraft).not.toHaveBeenCalled()
    })
  })
})
