"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type WeatherResponse = {
  location: string;
  temperature: number;
  windSpeed: number;
  weatherDescription: string;
  timezone?: string | null;
  imageUrl?: string | null;
  fallbackImageUrl?: string | null;
};

type GeocodeResult = {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type WikipediaSummary = {
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
};

const weatherCodeMap: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Moderate showers",
  82: "Violent showers",
  95: "Thunderstorm",
};

const YOUTUBE_CALM_EMBED_URL =
  "https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&loop=1&playlist=jfKfPfyJRdk";
const MAX_VISIBLE_HISTORY_ITEMS = 5;
const MAX_STORED_HISTORY_ITEMS = 30;

export default function Home() {
  const [city, setCity] = useState("");
  const [result, setResult] = useState<WeatherResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggedInUser, setLoggedInUser] = useState("");
  const [showLoginNotice, setShowLoginNotice] = useState(false);
  const [fadeLoginNotice, setFadeLoginNotice] = useState(false);
  const [cityTime, setCityTime] = useState("");
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [clickCount, setClickCount] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  function getAudioContext() {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    return audioContextRef.current;
  }

  function playCongratulationsSound() {
    const context = getAudioContext();
    if (!context) {
      return;
    }
    const start = context.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      const noteStart = start + index * 0.14;
      const noteEnd = noteStart + 0.12;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gainNode.gain.setValueAtTime(0, noteStart);
      gainNode.gain.linearRampToValueAtTime(0.2, noteStart + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, noteEnd);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    });
  }

  function toggleMusic() {
    setIsMusicPlaying((value) => !value);
  }

  useEffect(() => {
    const savedUser = window.localStorage.getItem("weather_user");
    if (savedUser) {
      setLoggedInUser(savedUser);
    }

    const savedHistory = window.localStorage.getItem("weather_search_history");
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory) as string[];
        if (Array.isArray(parsed)) {
          setSearchHistory(parsed.slice(0, MAX_STORED_HISTORY_ITEMS));
        }
      } catch {
        setSearchHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    if (!result?.timezone) {
      setCityTime("");
      return;
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: result.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const updateTime = () => setCityTime(formatter.format(new Date()));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [result?.timezone]);

  useEffect(() => {
    if (!showLoginNotice) {
      return;
    }

    const fadeTimer = setTimeout(() => setFadeLoginNotice(true), 1600);
    const hideTimer = setTimeout(() => {
      setShowLoginNotice(false);
      setFadeLoginNotice(false);
    }, 2500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [showLoginNotice]);

  function onLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");

    const cleanUsername = username.trim();
    if (!cleanUsername || !password.trim()) {
      setLoginError("Enter username and password.");
      return;
    }

    setLoggedInUser(cleanUsername);
    window.localStorage.setItem("weather_user", cleanUsername);
    setPassword("");
    setIsLoginOpen(false);
    setShowLoginNotice(true);
    setFadeLoginNotice(false);
  }

  function onLogout() {
    setLoggedInUser("");
    setUsername("");
    setPassword("");
    setLoginError("");
    setIsLoginOpen(false);
    window.localStorage.removeItem("weather_user");
    setShowLoginNotice(false);
    setFadeLoginNotice(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const cleanCity = city.trim();
      const geocodeResponse = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanCity)}&count=1`,
      );
      const geocodeData = await geocodeResponse.json();
      const location: GeocodeResult | undefined = geocodeData?.results?.[0];

      if (!location) {
        setError("City not found.");
        return;
      }

      const weatherResponse = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`,
      );
      const weatherData = await weatherResponse.json();
      const current = weatherData?.current;
      if (!current) {
        setError("Weather unavailable.");
        return;
      }

      let imageUrl: string | null = null;
      const fallbackImageUrl = `https://loremflickr.com/1600/900/${encodeURIComponent(
        `${location.name} ${location.country} skyline`,
      )}`;

      try {
        const wikiResponse = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(location.name)}`,
        );
        if (wikiResponse.ok) {
          const wikiData: WikipediaSummary = await wikiResponse.json();
          imageUrl = wikiData.originalimage?.source ?? wikiData.thumbnail?.source ?? null;
        }
      } catch {
        imageUrl = null;
      }

      const nextResult: WeatherResponse = {
        location: `${location.name}, ${location.country}`,
        temperature: current.temperature_2m,
        windSpeed: current.wind_speed_10m,
        weatherDescription: weatherCodeMap[current.weather_code] ?? "Unknown",
        timezone: location.timezone ?? weatherData?.timezone ?? null,
        imageUrl,
        fallbackImageUrl,
      };

      setResult(nextResult);
      setBgImageUrl(nextResult.imageUrl ?? nextResult.fallbackImageUrl ?? "");
      if (cleanCity) {
        const nextHistory = [
          cleanCity,
          ...searchHistory.filter((item) => item.toLowerCase() !== cleanCity.toLowerCase()),
        ].slice(0, MAX_STORED_HISTORY_ITEMS);
        setSearchHistory(nextHistory);
        window.localStorage.setItem("weather_search_history", JSON.stringify(nextHistory));
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <p className="absolute bottom-3 left-3 text-xs text-white/90 bg-black/45 px-2 py-1 rounded">
        Made by: Himansa
      </p>
      {bgImageUrl ? (
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={bgImageUrl}
          alt={result?.location ? `${result.location} background` : "City background"}
          onError={() => {
            const fallback = result?.fallbackImageUrl ?? "";
            if (fallback && bgImageUrl !== fallback) {
              setBgImageUrl(fallback);
            }
          }}
        />
      ) : null}
      {result?.timezone && cityTime ? (
        <div className="absolute top-4 right-4 rounded-md bg-black/70 px-3 py-2 text-sm text-white">
          {cityTime}
        </div>
      ) : null}
      {showLoginNotice ? (
        <div
          className={`absolute top-4 left-1/2 -translate-x-1/2 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white transition-opacity duration-700 ${fadeLoginNotice ? "opacity-0" : "opacity-100"
            }`}
        >
          Logged in as {loggedInUser}
        </div>
      ) : null}
      {loggedInUser ? (
        <button
          type="button"
          className="absolute top-1 left-1 rounded-md bg-orange-600 px-3 py-1 text-white shadow-[0_3px_0_0_#c2410c] transition-all duration-100 hover:bg-orange-700 active:translate-y-1 active:shadow-[0_1px_0_0_#c2410c]"
          onClick={onLogout}
        >
          Log out
        </button>
      ) : (
        <div className="absolute top-4 left-4 rounded-md bg-white/90 p-3 text-sm text-black shadow-sm">
          <button
            type="button"
            className="rounded-md bg-violet-600 px-3 py-1 text-white shadow-[0_3px_0_0_#6d28d9] transition-all duration-100 hover:bg-violet-700 active:translate-y-1 active:shadow-[0_1px_0_0_#6d28d9]"
            onClick={() => setIsLoginOpen((open) => !open)}
          >
            Log in
          </button>
          {isLoginOpen ? (
            <form onSubmit={onLoginSubmit} className="mt-2 space-y-2">
              <input
                className="w-full rounded-md border border-black/20 px-2 py-1 text-black"
                placeholder="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <input
                className="w-full rounded-md border border-black/20 px-2 py-1 text-black"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="submit"
                className="rounded-md bg-violet-600 px-3 py-1 text-white shadow-[0_3px_0_0_#6d28d9] transition-all duration-100 hover:bg-violet-700 active:translate-y-1 active:shadow-[0_1px_0_0_#6d28d9]"
              >
                Log in
              </button>
              {loginError ? <p className="text-red-600">{loginError}</p> : null}
            </form>
          ) : null}
        </div>
      )}
      <div className="relative w-full max-w-xl rounded-xl border border-black/10 bg-white/95 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-black">Weather Checker</h1>
        <p className="mt-1 text-sm text-black/70">Enter a city to see the current weather.</p>

        <form onSubmit={onSubmit} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <input
              className="w-full rounded-md border border-black/20 bg-white px-3 py-2 text-black placeholder:text-black/50 outline-none focus:border-black"
              placeholder="e.g. New York"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              onFocus={() => setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 120)}
              required
            />
            {showHistory && searchHistory.length > 0 ? (
              <div
                className="absolute top-full z-20 mt-1 w-full rounded-md border border-black/15 bg-white shadow-md overflow-y-auto"
                style={{ maxHeight: `${MAX_VISIBLE_HISTORY_ITEMS * 40}px` }}
              >
                {searchHistory.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-black/5"
                    onMouseDown={() => setCity(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-white shadow-[0_4px_0_0_#1d4ed8] transition-all duration-100 hover:bg-blue-700 active:translate-y-1 active:shadow-[0_1px_0_0_#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Checking..." : "Check"}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <button
          type="button"
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white shadow-[0_4px_0_0_#047857] transition-all duration-100 hover:bg-emerald-700 active:translate-y-1 active:shadow-[0_1px_0_0_#047857]"
          onClick={toggleMusic}
        >
          {isMusicPlaying ? "Pause calm music" : "Play calm music"}
        </button>
        {isMusicPlaying ? (
          <div className="mt-3 overflow-hidden rounded-md border border-black/20">
            <iframe
              width="100%"
              height="120"
              src={YOUTUBE_CALM_EMBED_URL}
              title="Calm YouTube music"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        ) : null}

        {result ? (
          <div className="mt-5 rounded-md bg-sky-50 p-4 text-sm text-black">
            <p className="font-semibold">{result.location}</p>
            <p>Temperature: {result.temperature} degC</p>
            <p>Wind Speed: {result.windSpeed} km/h</p>
            <p>Condition: {result.weatherDescription}</p>
          </div>
        ) : null}

        <button
          type="button"
          className="mt-8 ml-4 rounded-md bg-rose-600 px-4 py-2 text-sm text-white shadow-[0_4px_0_0_#be123c] transition-all duration-100 hover:bg-rose-700 active:translate-y-1 active:shadow-[0_1px_0_0_#be123c]"
          onClick={() =>
            setClickCount((count) => {
              const nextCount = count + 1;
              if (nextCount % 100 === 0) {
                playCongratulationsSound();
              }
              return nextCount;
            })
          }
        >
          click me
        </button>
        <p className="mt-2 text-sm text-black">Clicks: {clickCount}</p>

      </div>
    </main>
  );
}
