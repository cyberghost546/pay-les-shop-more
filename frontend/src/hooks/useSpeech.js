// src/hooks/useSpeech.js
//
// Reads a line of text out loud with the browser's own speech synthesiser, so
// the tutorial can be listened to as well as read. Nothing is downloaded and
// nothing is sent anywhere: the voices are the ones already installed on the
// visitor's device.
//
// Support is uneven. Chrome and Edge on Windows and Android, and Safari on
// macOS and iOS, all speak; a browser without the API, or one with no voice
// for any language, reports `supported: false` and the page then simply hides
// its listen button rather than offering something that stays silent.

import { useCallback, useEffect, useRef, useState } from 'react';

// Which voice to look for, per site language, best match first. Papiamentu is
// not a language any browser ships a voice for; Spanish reads it far closer to
// how it sounds than Dutch or English do, so that is the stand-in.
const VOICE_PREFERENCE = {
  nl: ['nl'],
  en: ['en-GB', 'en-US', 'en'],
  pap: ['pap', 'es', 'nl'],
};

// What <html lang> and the utterance are told. Papiamentu has no BCP-47 voice
// tag in practice, so it borrows the one belonging to the voice that speaks.
const SPOKEN_LANG = { nl: 'nl-NL', en: 'en-GB', pap: 'es-ES' };

/** The installed voice that best matches `language`, or null for none. */
function pickVoice(voices, language) {
  for (const prefix of VOICE_PREFERENCE[language] ?? []) {
    const match = voices.find((voice) =>
      voice.lang.toLowerCase().replace('_', '-').startsWith(prefix.toLowerCase()),
    );
    if (match) return match;
  }
  return null;
}

/**
 * @param {'nl'|'en'|'pap'} language the site language the text is written in
 * @returns {{
 *   supported: boolean,
 *   speaking: boolean,
 *   speak: (text: string) => void,
 *   stop: () => void,
 * }}
 */
export function useSpeech(language) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(false);

  // Held in a ref as well: the cleanup below runs after a re-render has already
  // replaced the state, and it still needs the utterance it started.
  const currentRef = useRef(null);

  // The voice list is populated asynchronously in Chrome — the first call
  // usually returns nothing and `voiceschanged` fires a moment later.
  useEffect(() => {
    if (!synth) return undefined;

    const read = () => setVoices(synth.getVoices());
    read();
    synth.addEventListener('voiceschanged', read);
    return () => synth.removeEventListener('voiceschanged', read);
  }, [synth]);

  const stop = useCallback(() => {
    currentRef.current = null;
    setSpeaking(false);
    synth?.cancel();
  }, [synth]);

  const speak = useCallback(
    (text) => {
      if (!synth || !text) return;

      // Whatever is being said now is abandoned: pressing "listen" on a new
      // step means that step, not a queue of everything pressed so far.
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(synth.getVoices(), language);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? SPOKEN_LANG[language] ?? 'nl-NL';
      // A shade under conversational pace: these are instructions with an
      // address and a postcode in them, and they are being written down.
      utterance.rate = 0.95;
      utterance.pitch = 1.05;

      const finish = () => {
        if (currentRef.current !== utterance) return;
        currentRef.current = null;
        setSpeaking(false);
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      currentRef.current = utterance;
      setSpeaking(true);
      synth.speak(utterance);
    },
    [synth, language],
  );

  // Leaving the page mid-sentence should not carry the voice to the next one.
  useEffect(() => stop, [stop]);

  return {
    supported: Boolean(synth) && voices.length > 0,
    speaking,
    speak,
    stop,
  };
}
