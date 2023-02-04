const _characters = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function randomChar(length: number, characters = _characters) {
  let result = '';
  const charactersLength = characters.length;
  let i = 0;
  for (i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function hashStringToInt(str: string): number {
  let hash = 5381;
  let i = -1;
  while (i < str.length - 1) {
    i += 1;
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}
