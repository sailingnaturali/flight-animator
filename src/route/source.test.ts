import { describe, it, expect } from 'vitest';
import { routeSearch } from './source';

describe('routeSearch', () => {
  it('prefers the injected route global as a ?d= search', () => {
    expect(routeSearch('eyJ2IjoxfQ', '?r=sfo-lhr', '')).toBe('?d=eyJ2IjoxfQ');
  });
  it('falls back to location.search when no global', () => {
    expect(routeSearch(undefined, '?r=sfo-lhr', '')).toBe('?r=sfo-lhr');
  });
  it('falls back to the hash when search is empty', () => {
    expect(routeSearch(undefined, '', '#r=sfo-lhr')).toBe('r=sfo-lhr');
  });
});
