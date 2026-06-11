'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'

// Minimal types for the Google Places API, avoids needing @types/google.maps.
interface GooglePlace {
  formatted_address?: string
  name?: string
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
  onPlaceSelect?: (address: string, venueName: string | undefined) => void
  placeholder?: string
  className?: string
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
}: PlacesAddressInputProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const inputRef = useRef<HTMLInputElement>(null)
  const [scriptReady, setScriptReady] = useState(
    typeof window !== 'undefined' && !!window.__googleMapsPlacesLoaded
  )

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

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      fields: ['formatted_address', 'name'],
    })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      const address = place.formatted_address ?? ''
      onChange(address)
      if (onPlaceSelect) {
        onPlaceSelect(address, place.name)
      }
    })
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
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  )
}
