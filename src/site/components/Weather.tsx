import { useEffect, useState } from 'preact/hooks';
import { safeStorage } from '@/lib/store';
import { Icon } from '@/ui/Icon';
import { useNews } from '../data';

interface Reading { temp: number; label: string; icon: string; at: number }
const store = safeStorage('session');

function describe(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Clear', icon: 'sun' };
  if (code <= 2) return { label: 'Partly cloudy', icon: 'cloud-sun' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Foggy', icon: 'fog' };
  if (code >= 51 && code <= 67) return { label: 'Rain', icon: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Showers', icon: 'rain' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'snow' };
  if (code >= 95) return { label: 'Thunderstorms', icon: 'storm' };
  return { label: 'Cloudy', icon: 'cloud' };
}

/** Live conditions from Open-Meteo (free, no API key). Hidden if unavailable. */
export function Weather() {
  const { site } = useNews();
  const { latitude, longitude, place } = site.settings.site;
  const [reading, setReading] = useState<Reading | null>(() => {
    const cached = store.get<Reading | null>('falcon-weather', null);
    return cached && Date.now() - cached.at < 15 * 60_000 ? cached : null;
  });

  useEffect(() => {
    if (reading) return;
    const ctl = new AbortController();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`;
    fetch(url, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('weather'))))
      .then((j) => {
        const next = { temp: Math.round(j.current.temperature_2m), ...describe(j.current.weather_code), at: Date.now() };
        store.set('falcon-weather', next);
        setReading(next);
      })
      .catch(() => { /* optional widget */ });
    return () => ctl.abort();
  }, [latitude, longitude]);

  if (!reading) return null;
  return (
    <span class="weather" title={`Current conditions in ${place}`}>
      <Icon name={reading.icon} size={14} /> {place} · {reading.temp}°F {reading.label}
    </span>
  );
}
