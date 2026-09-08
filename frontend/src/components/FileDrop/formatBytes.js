// src/components/FileDrop/formatBytes.js
//
// Its own file rather than a second export from FileDrop.jsx: a module that
// exports both a component and a plain function defeats React Fast Refresh,
// which can only swap a module whose exports are all components.

/** "2,4 MB", "812 kB" — a size somebody can compare against "up to 10 MB". */
export function formatBytes(bytes, locale = 'nl-NL') {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024).toLocaleString(locale)} kB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}
