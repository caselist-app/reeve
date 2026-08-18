'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

// Minimal types for the Google Places API, avoids needing @types/google.maps.
interface GooglePlace {
  formatted_address?: string
  name?: string
  geometry?: {
    location?: {
      lat(): number
      lng(): number
    }
  }
}

interface GoogleAutocomplete {
  addListener(event: string, handler: () => void): void
  getPlace(): GooglePlace
}

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            options?: { types?: string[]; fields?: string[] }
          ) => GoogleAutocomplete
        }
        event: {
          clearInstanceListeners(instance: object): void
        }
      }
    }
    __googleMapsPlacesLoaded?: boolean
  }
}

interface PlacesAddressInputProps {
  id?: string
  name: string
  value: string
  onChange: (value: string) => void
  onPlaceSelect?: (
    address: string,
    venueName: string | undefined,
    lat: number | undefined,
    lng: number | undefined
  ) => void
  placeholder?: string
  className?: string
  // Autocomplete result types. Defaults to street addresses and establishments.
  // Pass ['(cities)'] for city-only results (home city, departure city).
  types?: string[]
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  // Requests coordinates from Google alongside the address. Off by default:
  // most of this component's callers (hotel/drive/rail/rehearsal/event fields)
  // have no use for a lat/lng, and every field requesting geometry adds cost
  // per Google's Places pricing. Scope it to the callers that need it (REE-212).
  includeGeometry?: boolean
}

// Loads the Google Maps Places API script once per page and attaches an
// Autocomplete widget to the input. Falls back to a plain controlled Input
// if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set.
export function PlacesAddressInput({
  id,
  name,
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  className,
  types = ['establishment', 'geocode'],
  onKeyDown,
  onBlur,
  includeGeometry = false,
}: PlacesAddressInputProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const inputRef = useRef<HTMLInputElement>(null)
  const [scriptReady, setScriptReady] = useState(
    typeof window !== 'undefined' && !!window.__googleMapsPlacesLoaded
  )

  // The Autocomplete listener is attached once, so it would otherwise capture
  // the callbacks from that single render. Keep the latest ones in refs so the
  // listener always calls through to the current closures (e.g. so consumers
  // reading fresh state like a user-typed name see the up-to-date value).
  const onChangeRef = useRef(onChange)
  const onPlaceSelectRef = useRef(onPlaceSelect)
  onChangeRef.current = onChange
  onPlaceSelectRef.current = onPlaceSelect

  // Enter in an address field is for choosing an autocomplete suggestion, not
  // submitting the form. Google's Autocomplete selects the highlighted
  // prediction from its own keydown listener regardless of this, so all we do
  // here is stop the browser's implicit form submission. Without it, pressing
  // Enter to pick an address saved the whole form and closed the panel: on the
  // Add drive form that created the segment and reopening showed the edit view,
  // which looks nothing like it (REE-126). Applied on both the live Autocomplete
  // branch and the plain-input fallback, so the behaviour does not hinge on
  // whether the Maps script has loaded (REE-284: the live branch was missed the
  // first time round, so Enter on a real suggestion still submitted the form).
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.preventDefault()
    onKeyDown?.(e)
  }

  // Load the Places API script once.
  useEffect(() => {
    if (!apiKey || scriptReady) return

    if (window.__googleMapsPlacesLoaded) {
      setScriptReady(true)
      return
    }

    const existing = document.querySelector('#google-maps-places-script')
    if (existing) {
      // Script tag exists but hasn't fired onload yet, wait for the flag.
      const interval = setInterval(() => {
        if (window.__googleMapsPlacesLoaded) {
          setScriptReady(true)
          clearInterval(interval)
        }
      }, 100)
      return () => clearInterval(interval)
    }

    const script = document.createElement('script')
    script.id = 'google-maps-places-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.onload = () => {
      window.__googleMapsPlacesLoaded = true
      setScriptReady(true)
    }
    document.head.appendChild(script)
  }, [apiKey, scriptReady])

  // Attach the Autocomplete widget once the script is ready.
  useEffect(() => {
    if (!scriptReady || !inputRef.current || !window.google) return

    // Google appends this widget's suggestion dropdown to document.body and
    // gives no API to take it away again. Snapshot what is already there, so
    // the cleanup below removes only the node this instance caused. A blunt
    // "remove every .pac-container" would delete the sibling's dropdown:
    // transport, rail and drive each mount two of these at once (origin and
    // destination).
    const preexisting = new Set(document.querySelectorAll('.pac-container'))

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types,
      fields: includeGeometry
        ? ['formatted_address', 'name', 'geometry']
        : ['formatted_address', 'name'],
    })

    // Empty if Google builds the dropdown lazily on first keystroke rather than
    // in the constructor. That case simply leaves the node alone, which is what
    // already happened before this cleanup existed, so it is never worse.
    const ownDropdowns = Array.from(document.querySelectorAll('.pac-container')).filter(
      (el) => !preexisting.has(el)
    )

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      const address = place.formatted_address ?? ''
      onChangeRef.current(address)
      if (onPlaceSelectRef.current) {
        const location = place.geometry?.location
        onPlaceSelectRef.current(address, place.name, location?.lat(), location?.lng())
      }
    })

    // Without this, every open of a panel or add form leaves a listener holding
    // this render's onChange, plus a dropdown node on body, for the life of the
    // tab. One venue field never showed it. Twelve fields on the day view, which
    // a TM opens and closes all day, is what makes it matter.
    return () => {
      window.google?.maps.event.clearInstanceListeners(autocomplete)
      ownDropdowns.forEach((el) => el.remove())
    }
    // Intentional: only run once after script loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady])

  // No key, plain input.
  if (!apiKey) {
    return (
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        placeholder={placeholder}
        className={className}
      />
    )
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  )
}
