import { describe, it, expect } from 'vitest';
import { safeDecodeBuffer, safeEncodeString } from '../src/core/encoding';

describe('Zero-Byte Native Character Encoding (safeDecodeBuffer & safeEncodeString)', () => {
  it('should encode a string into Uint8Array bytes using native Web API', () => {
    const input = 'Enterprise Database Wrapper 🚀';
    const encoded = safeEncodeString(input);

    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('should decode a buffer into a UTF-8 string without external library dependencies', () => {
    const originalText = 'Enterprise Database Wrapper with multibyte characters: ñoño, 日本語, 🚀, ümlaut';
    const buffer = Buffer.from(originalText, 'utf-8');

    const decoded = safeDecodeBuffer(buffer);
    expect(decoded).toBe(originalText);
  });

  it('should decode Uint8Array directly', () => {
    const originalText = 'Hello World from Uint8Array';
    const uint8 = safeEncodeString(originalText);

    const decoded = safeDecodeBuffer(uint8);
    expect(decoded).toBe(originalText);
  });

  it('should handle empty string and empty buffer gracefully', () => {
    expect(safeEncodeString('')).toEqual(new Uint8Array(0));
    expect(safeDecodeBuffer(Buffer.alloc(0))).toBe('');
    expect(safeDecodeBuffer(new Uint8Array(0))).toBe('');
  });
});
