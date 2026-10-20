/**
 * Zero-byte Native Character Encoding and Decoding Utilities.
 *
 * Replaces heavy external multibyte encoding libraries (such as iconv-lite)
 * with standard Web API primitives (TextDecoder and TextEncoder) natively
 * optimized directly in the Node.js core runtime.
 */

// Shared reusable decoder instance for UTF-8 byte streams
const utf8Decoder = new TextDecoder('utf-8');

// Shared reusable encoder instance for UTF-8 string serialization
const utf8Encoder = new TextEncoder();

/**
 * Safely decodes a binary Buffer or Uint8Array into a UTF-8 string without
 * incurring the memory footprint of third-party encoding libraries.
 *
 * @param buffer - The raw binary buffer or Uint8Array to decode.
 * @returns The decoded UTF-8 string representation.
 */
export function safeDecodeBuffer(buffer: Buffer | Uint8Array): string {
  if (!buffer || (buffer.length === 0)) {
    return '';
  }
  return utf8Decoder.decode(buffer);
}

/**
 * Safely encodes a UTF-8 string into a binary Uint8Array using Node.js
 * native Web API primitives.
 *
 * @param str - The string to encode into binary bytes.
 * @returns The encoded Uint8Array byte sequence.
 */
export function safeEncodeString(str: string): Uint8Array {
  if (!str) {
    return new Uint8Array(0);
  }
  return utf8Encoder.encode(str);
}
