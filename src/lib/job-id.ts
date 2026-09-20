type WebCryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

let fallbackSequence = 0;

// This only names transient paths in FFmpeg's in-memory file system.
export function createJobId(
  webCrypto: WebCryptoLike | undefined = globalThis.crypto as WebCryptoLike | undefined,
): string {
  if (typeof webCrypto?.randomUUID === 'function') {
    try {
      return webCrypto.randomUUID().replaceAll('-', '');
    } catch {
      // Continue with the compatible sources below.
    }
  }

  if (typeof webCrypto?.getRandomValues === 'function') {
    try {
      const values = new Uint8Array(16);
      webCrypto.getRandomValues(values);
      return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
    } catch {
      // HTTP and older browsers can still use the local fallback below.
    }
  }

  fallbackSequence += 1;
  return `${Date.now().toString(36)}${fallbackSequence.toString(36)}${Math.random()
    .toString(36)
    .slice(2)}`;
}
