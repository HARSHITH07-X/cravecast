import type { FirestoreClient } from './firestoreRest.js';

interface WeatherDay {
  date: string;
  condition: string;
  tempMin: number;
  tempMax: number;
  precipitationChance: number;
  humidity: number;
}

/**
 * Fetches historical daily weather from Open-Meteo Archive API and caches it in Firestore.
 */
export async function cacheHistoricalWeather(
  restaurantId: string,
  city: string,
  dates: string[],
  db?: FirestoreClient
): Promise<void> {
  if (!dates || dates.length === 0 || !city || !db) return;

  try {
    // 1. Geocode City
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) return;
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) return;

    const { latitude, longitude } = geoData.results[0];

    // Find date range
    const sortedDates = [...dates].sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];

    // 2. Fetch Open-Meteo Archive for date range
    const weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean&timezone=auto`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) return;

    const weatherData = await weatherRes.json();
    if (!weatherData.daily || !weatherData.daily.time) return;

    const batch = db.batch();
    const daily = weatherData.daily;

    for (let i = 0; i < daily.time.length; i++) {
      const dayDate = daily.time[i];
      const precip = daily.precipitation_sum?.[i] || 0;
      const isRain = precip > 1.0;
      const condition = isRain ? 'Rainy' : 'Clear/Mild';

      const weatherDoc: WeatherDay = {
        date: dayDate,
        condition,
        tempMin: daily.temperature_2m_min?.[i] || 20,
        tempMax: daily.temperature_2m_max?.[i] || 30,
        precipitationChance: isRain ? 80 : 10,
        humidity: daily.relative_humidity_2m_mean?.[i] || 60,
      };

      const docRef = db.collection(`restaurants/${restaurantId}/weather_cache`).doc(dayDate);
      batch.set(docRef, {
        ...weatherDoc,
        restaurantId,
        city,
        fetchedAt: new Date().toISOString(),
      }, { merge: true });
    }

    await batch.commit();
  } catch (err) {
    // Weather enrichment is non-fatal
    console.warn('Weather cache fetch skipped:', err);
  }
}
