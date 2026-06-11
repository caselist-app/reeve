// Curated airport list for hub resolution.
// Covers the main touring regions: UK, Europe, North America, Australia.
// Source: OurAirports public data. Add entries as needed.

export type Airport = {
  iata: string
  name: string
  lat: number
  lng: number
}

export const AIRPORTS: Airport[] = [
  // United Kingdom
  { iata: 'LHR', name: 'London Heathrow', lat: 51.4775, lng: -0.4614 },
  { iata: 'LGW', name: 'London Gatwick', lat: 51.1481, lng: -0.1903 },
  { iata: 'STN', name: 'London Stansted', lat: 51.885, lng: 0.235 },
  { iata: 'LTN', name: 'London Luton', lat: 51.8747, lng: -0.3683 },
  { iata: 'LCY', name: 'London City', lat: 51.5053, lng: 0.0553 },
  { iata: 'MAN', name: 'Manchester', lat: 53.3537, lng: -2.2750 },
  { iata: 'BHX', name: 'Birmingham', lat: 52.4539, lng: -1.7480 },
  { iata: 'EDI', name: 'Edinburgh', lat: 55.9500, lng: -3.3725 },
  { iata: 'GLA', name: 'Glasgow', lat: 55.8719, lng: -4.4330 },
  { iata: 'BRS', name: 'Bristol', lat: 51.3827, lng: -2.7191 },
  { iata: 'NCL', name: 'Newcastle', lat: 55.0375, lng: -1.6917 },
  { iata: 'LBA', name: 'Leeds Bradford', lat: 53.8659, lng: -1.6606 },
  { iata: 'BFS', name: 'Belfast International', lat: 54.6575, lng: -6.2158 },
  { iata: 'ORK', name: 'Cork', lat: 51.8413, lng: -8.4910 },
  { iata: 'DUB', name: 'Dublin', lat: 53.4213, lng: -6.2701 },
  { iata: 'SOU', name: 'Southampton', lat: 50.9503, lng: -1.3568 },
  { iata: 'NQY', name: 'Newquay Cornwall', lat: 50.4406, lng: -4.9954 },
  { iata: 'ABZ', name: 'Aberdeen', lat: 57.2019, lng: -2.1978 },
  { iata: 'INV', name: 'Inverness', lat: 57.5425, lng: -4.0475 },
  { iata: 'EXT', name: 'Exeter', lat: 50.7344, lng: -3.4139 },
  { iata: 'NWI', name: 'Norwich', lat: 52.6758, lng: 1.2828 },
  { iata: 'HUY', name: 'Humberside', lat: 53.5744, lng: -0.3508 },

  // France
  { iata: 'CDG', name: 'Paris Charles de Gaulle', lat: 49.0097, lng: 2.5479 },
  { iata: 'ORY', name: 'Paris Orly', lat: 48.7233, lng: 2.3794 },
  { iata: 'LYS', name: 'Lyon', lat: 45.7256, lng: 5.0811 },
  { iata: 'MRS', name: 'Marseille', lat: 43.4365, lng: 5.2150 },
  { iata: 'NCE', name: 'Nice', lat: 43.6584, lng: 7.2159 },
  { iata: 'TLS', name: 'Toulouse', lat: 43.6293, lng: 1.3638 },
  { iata: 'BOD', name: 'Bordeaux', lat: 44.8283, lng: -0.7156 },
  { iata: 'NTE', name: 'Nantes', lat: 47.1532, lng: -1.6108 },
  { iata: 'SXB', name: 'Strasbourg', lat: 48.5383, lng: 7.6281 },
  { iata: 'LIL', name: 'Lille', lat: 50.5614, lng: 3.0894 },
  { iata: 'RNS', name: 'Rennes', lat: 48.0695, lng: -1.7348 },

  // Germany
  { iata: 'FRA', name: 'Frankfurt', lat: 50.0379, lng: 8.5622 },
  { iata: 'MUC', name: 'Munich', lat: 48.3538, lng: 11.7861 },
  { iata: 'DUS', name: 'Dusseldorf', lat: 51.2895, lng: 6.7668 },
  { iata: 'HAM', name: 'Hamburg', lat: 53.6304, lng: 9.9882 },
  { iata: 'BER', name: 'Berlin Brandenburg', lat: 52.3667, lng: 13.5033 },
  { iata: 'STR', name: 'Stuttgart', lat: 48.6899, lng: 9.2220 },
  { iata: 'CGN', name: 'Cologne Bonn', lat: 50.8659, lng: 7.1427 },
  { iata: 'NUE', name: 'Nuremberg', lat: 49.4987, lng: 11.0669 },
  { iata: 'LEJ', name: 'Leipzig Halle', lat: 51.4324, lng: 12.2416 },
  { iata: 'HAJ', name: 'Hannover', lat: 52.4611, lng: 9.6850 },
  { iata: 'BRE', name: 'Bremen', lat: 53.0475, lng: 8.7867 },

  // Benelux
  { iata: 'AMS', name: 'Amsterdam Schiphol', lat: 52.3086, lng: 4.7639 },
  { iata: 'BRU', name: 'Brussels', lat: 50.9014, lng: 4.4844 },
  { iata: 'LUX', name: 'Luxembourg', lat: 49.6234, lng: 6.2044 },

  // Switzerland / Austria
  { iata: 'ZRH', name: 'Zurich', lat: 47.4647, lng: 8.5492 },
  { iata: 'GVA', name: 'Geneva', lat: 46.2381, lng: 6.1089 },
  { iata: 'VIE', name: 'Vienna', lat: 48.1103, lng: 16.5697 },
  { iata: 'SZG', name: 'Salzburg', lat: 47.7933, lng: 13.0044 },
  { iata: 'INN', name: 'Innsbruck', lat: 47.2600, lng: 11.3439 },

  // Nordics
  { iata: 'CPH', name: 'Copenhagen', lat: 55.6181, lng: 12.6561 },
  { iata: 'OSL', name: 'Oslo Gardermoen', lat: 60.1939, lng: 11.1004 },
  { iata: 'ARN', name: 'Stockholm Arlanda', lat: 59.6519, lng: 17.9186 },
  { iata: 'HEL', name: 'Helsinki', lat: 60.3172, lng: 24.9633 },
  { iata: 'GOT', name: 'Gothenburg', lat: 57.6628, lng: 12.2798 },
  { iata: 'TRD', name: 'Trondheim', lat: 63.4578, lng: 10.9239 },
  { iata: 'BGO', name: 'Bergen', lat: 60.2934, lng: 5.2181 },

  // Iberia
  { iata: 'MAD', name: 'Madrid Barajas', lat: 40.4936, lng: -3.5668 },
  { iata: 'BCN', name: 'Barcelona El Prat', lat: 41.2971, lng: 2.0785 },
  { iata: 'VLC', name: 'Valencia', lat: 39.4893, lng: -0.4816 },
  { iata: 'SVQ', name: 'Seville', lat: 37.4180, lng: -5.8931 },
  { iata: 'AGP', name: 'Malaga', lat: 36.6749, lng: -4.4991 },
  { iata: 'BIO', name: 'Bilbao', lat: 43.3011, lng: -2.9106 },
  { iata: 'LIS', name: 'Lisbon', lat: 38.7756, lng: -9.1354 },
  { iata: 'OPO', name: 'Porto', lat: 41.2481, lng: -8.6814 },

  // Italy
  { iata: 'MXP', name: 'Milan Malpensa', lat: 45.6306, lng: 8.7281 },
  { iata: 'LIN', name: 'Milan Linate', lat: 45.4453, lng: 9.2767 },
  { iata: 'FCO', name: 'Rome Fiumicino', lat: 41.7999, lng: 12.2462 },
  { iata: 'NAP', name: 'Naples', lat: 40.8860, lng: 14.2908 },
  { iata: 'VCE', name: 'Venice', lat: 45.5053, lng: 12.3519 },
  { iata: 'BLQ', name: 'Bologna', lat: 44.5354, lng: 11.2887 },
  { iata: 'TRN', name: 'Turin', lat: 45.2008, lng: 7.6497 },
  { iata: 'PMO', name: 'Palermo', lat: 38.1796, lng: 13.0910 },

  // Eastern Europe
  { iata: 'WAW', name: 'Warsaw', lat: 52.1657, lng: 20.9671 },
  { iata: 'KRK', name: 'Krakow', lat: 50.0778, lng: 19.7848 },
  { iata: 'PRG', name: 'Prague', lat: 50.1008, lng: 14.2600 },
  { iata: 'BUD', name: 'Budapest', lat: 47.4369, lng: 19.2556 },
  { iata: 'OTP', name: 'Bucharest', lat: 44.5722, lng: 26.1022 },
  { iata: 'SOF', name: 'Sofia', lat: 42.6967, lng: 23.4114 },
  { iata: 'ZAG', name: 'Zagreb', lat: 45.7429, lng: 16.0688 },
  { iata: 'LJU', name: 'Ljubljana', lat: 46.2237, lng: 14.4576 },
  { iata: 'BEG', name: 'Belgrade', lat: 44.8184, lng: 20.3091 },
  { iata: 'KIV', name: 'Chisinau', lat: 46.9278, lng: 28.9311 },
  { iata: 'RIX', name: 'Riga', lat: 56.9236, lng: 23.9711 },
  { iata: 'TLL', name: 'Tallinn', lat: 59.4133, lng: 24.8328 },
  { iata: 'VNO', name: 'Vilnius', lat: 54.6341, lng: 25.2858 },

  // Greece / Turkey
  { iata: 'ATH', name: 'Athens', lat: 37.9364, lng: 23.9445 },
  { iata: 'SKG', name: 'Thessaloniki', lat: 40.5197, lng: 22.9709 },
  { iata: 'IST', name: 'Istanbul', lat: 41.2753, lng: 28.7519 },

  // US Northeast
  { iata: 'JFK', name: 'New York JFK', lat: 40.6413, lng: -73.7781 },
  { iata: 'LGA', name: 'New York LaGuardia', lat: 40.7772, lng: -73.8726 },
  { iata: 'EWR', name: 'Newark', lat: 40.6925, lng: -74.1687 },
  { iata: 'BOS', name: 'Boston Logan', lat: 42.3656, lng: -71.0096 },
  { iata: 'PHL', name: 'Philadelphia', lat: 39.8744, lng: -75.2424 },
  { iata: 'BWI', name: 'Baltimore Washington', lat: 39.1754, lng: -76.6683 },
  { iata: 'DCA', name: 'Washington Reagan', lat: 38.8521, lng: -77.0377 },
  { iata: 'IAD', name: 'Washington Dulles', lat: 38.9445, lng: -77.4558 },
  { iata: 'RDU', name: 'Raleigh Durham', lat: 35.8776, lng: -78.7875 },
  { iata: 'CLT', name: 'Charlotte Douglas', lat: 35.2140, lng: -80.9431 },
  { iata: 'PIT', name: 'Pittsburgh', lat: 40.4915, lng: -80.2329 },

  // US Midwest
  { iata: 'ORD', name: 'Chicago O\'Hare', lat: 41.9742, lng: -87.9073 },
  { iata: 'MDW', name: 'Chicago Midway', lat: 41.7868, lng: -87.7522 },
  { iata: 'DTW', name: 'Detroit Metro', lat: 42.2162, lng: -83.3554 },
  { iata: 'CLE', name: 'Cleveland Hopkins', lat: 41.4117, lng: -81.8498 },
  { iata: 'CVG', name: 'Cincinnati', lat: 39.0488, lng: -84.6678 },
  { iata: 'IND', name: 'Indianapolis', lat: 39.7173, lng: -86.2944 },
  { iata: 'MKE', name: 'Milwaukee Mitchell', lat: 42.9472, lng: -87.8966 },
  { iata: 'MSP', name: 'Minneapolis St Paul', lat: 44.8848, lng: -93.2223 },
  { iata: 'STL', name: 'St Louis Lambert', lat: 38.7487, lng: -90.3700 },
  { iata: 'MCI', name: 'Kansas City', lat: 39.2976, lng: -94.7139 },
  { iata: 'OMA', name: 'Omaha Eppley', lat: 41.3032, lng: -95.8941 },
  { iata: 'DSM', name: 'Des Moines', lat: 41.5340, lng: -93.6631 },

  // US South
  { iata: 'ATL', name: 'Atlanta Hartsfield', lat: 33.6407, lng: -84.4277 },
  { iata: 'TPA', name: 'Tampa', lat: 27.9755, lng: -82.5332 },
  { iata: 'MCO', name: 'Orlando', lat: 28.4294, lng: -81.3089 },
  { iata: 'FLL', name: 'Fort Lauderdale', lat: 26.0726, lng: -80.1527 },
  { iata: 'MIA', name: 'Miami', lat: 25.7959, lng: -80.2870 },
  { iata: 'MSY', name: 'New Orleans', lat: 29.9934, lng: -90.2580 },
  { iata: 'BNA', name: 'Nashville', lat: 36.1245, lng: -86.6782 },
  { iata: 'MEM', name: 'Memphis', lat: 35.0424, lng: -89.9767 },
  { iata: 'BHM', name: 'Birmingham Alabama', lat: 33.5629, lng: -86.7535 },
  { iata: 'JAX', name: 'Jacksonville', lat: 30.4941, lng: -81.6879 },

  // US Texas
  { iata: 'DAL', name: 'Dallas Love Field', lat: 32.8471, lng: -96.8517 },
  { iata: 'DFW', name: 'Dallas Fort Worth', lat: 32.8998, lng: -97.0403 },
  { iata: 'HOU', name: 'Houston Hobby', lat: 29.6454, lng: -95.2789 },
  { iata: 'IAH', name: 'Houston Intercontinental', lat: 29.9902, lng: -95.3368 },
  { iata: 'AUS', name: 'Austin', lat: 30.1975, lng: -97.6664 },
  { iata: 'SAT', name: 'San Antonio', lat: 29.5337, lng: -98.4698 },

  // US Mountain / West
  { iata: 'DEN', name: 'Denver', lat: 39.8561, lng: -104.6737 },
  { iata: 'SLC', name: 'Salt Lake City', lat: 40.7884, lng: -111.9778 },
  { iata: 'LAS', name: 'Las Vegas', lat: 36.0840, lng: -115.1537 },
  { iata: 'PHX', name: 'Phoenix Sky Harbor', lat: 33.4373, lng: -112.0078 },
  { iata: 'ABQ', name: 'Albuquerque', lat: 35.0402, lng: -106.6090 },
  { iata: 'TUS', name: 'Tucson', lat: 32.1161, lng: -110.9410 },

  // US West Coast
  { iata: 'LAX', name: 'Los Angeles', lat: 33.9425, lng: -118.4081 },
  { iata: 'SFO', name: 'San Francisco', lat: 37.6213, lng: -122.3790 },
  { iata: 'SJC', name: 'San Jose', lat: 37.3626, lng: -121.9290 },
  { iata: 'OAK', name: 'Oakland', lat: 37.7213, lng: -122.2208 },
  { iata: 'SEA', name: 'Seattle Tacoma', lat: 47.4502, lng: -122.3088 },
  { iata: 'PDX', name: 'Portland Oregon', lat: 45.5898, lng: -122.5951 },
  { iata: 'SAN', name: 'San Diego', lat: 32.7336, lng: -117.1897 },
  { iata: 'BUR', name: 'Hollywood Burbank', lat: 34.2007, lng: -118.3585 },
  { iata: 'LGB', name: 'Long Beach', lat: 33.8177, lng: -118.1516 },

  // Canada
  { iata: 'YYZ', name: 'Toronto Pearson', lat: 43.6772, lng: -79.6306 },
  { iata: 'YYC', name: 'Calgary', lat: 51.1315, lng: -114.0100 },
  { iata: 'YVR', name: 'Vancouver', lat: 49.1947, lng: -123.1792 },
  { iata: 'YUL', name: 'Montreal Trudeau', lat: 45.4706, lng: -73.7408 },
  { iata: 'YEG', name: 'Edmonton', lat: 53.3097, lng: -113.5797 },
  { iata: 'YOW', name: 'Ottawa Macdonald', lat: 45.3225, lng: -75.6692 },
  { iata: 'YHZ', name: 'Halifax Stanfield', lat: 44.8808, lng: -63.5086 },
  { iata: 'YWG', name: 'Winnipeg', lat: 49.9100, lng: -97.2399 },
  { iata: 'YQB', name: 'Quebec City', lat: 46.7911, lng: -71.3933 },

  // Australia / New Zealand
  { iata: 'SYD', name: 'Sydney Kingsford Smith', lat: -33.9399, lng: 151.1753 },
  { iata: 'MEL', name: 'Melbourne Tullamarine', lat: -37.6690, lng: 144.8410 },
  { iata: 'BNE', name: 'Brisbane', lat: -27.3842, lng: 153.1175 },
  { iata: 'PER', name: 'Perth', lat: -31.9385, lng: 115.9672 },
  { iata: 'ADL', name: 'Adelaide', lat: -34.9450, lng: 138.5306 },
  { iata: 'CBR', name: 'Canberra', lat: -35.3069, lng: 149.1950 },
  { iata: 'AKL', name: 'Auckland', lat: -37.0082, lng: 174.7917 },
  { iata: 'CHC', name: 'Christchurch', lat: -43.4894, lng: 172.5322 },
  { iata: 'WLG', name: 'Wellington', lat: -41.3272, lng: 174.8050 },

  // Japan / South Korea (for Asia-Pacific tours)
  { iata: 'NRT', name: 'Tokyo Narita', lat: 35.7648, lng: 140.3864 },
  { iata: 'HND', name: 'Tokyo Haneda', lat: 35.5494, lng: 139.7798 },
  { iata: 'KIX', name: 'Osaka Kansai', lat: 34.4272, lng: 135.2440 },
  { iata: 'ICN', name: 'Seoul Incheon', lat: 37.4691, lng: 126.4510 },
]

// Haversine formula: returns distance in kilometres between two lat/lng pairs.
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Returns the nearest airport and straight-line distance in km.
export function nearestAirport(lat: number, lng: number): { airport: Airport; distKm: number } {
  let best = AIRPORTS[0]
  let bestDist = haversineKm(lat, lng, best.lat, best.lng)
  for (const airport of AIRPORTS.slice(1)) {
    const d = haversineKm(lat, lng, airport.lat, airport.lng)
    if (d < bestDist) {
      best = airport
      bestDist = d
    }
  }
  return { airport: best, distKm: bestDist }
}

// Estimates ground transfer time in minutes from a straight-line distance.
// 80 km/h average speed (urban approach + motorway mix), minimum 20 min.
export function estimateGroundMinutes(distKm: number): number {
  return Math.max(20, Math.round((distKm / 80) * 60))
}
