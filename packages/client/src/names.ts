/**
 * 部隊の表示名。シナリオに書いた名前(試合の情報の unitNames)があればそれ、なければ ID から陣営の頭(us- など)を除いたもの。
 * 試合の情報を受け取ったときに setUnitNames で表を入れる(画面のどこからでも同じ名前を出すため)
 */
let names: Record<string, string> = {};

export function setUnitNames(n: Record<string, string> | undefined): void {
  names = n ?? {};
}

export function unitLabel(id: string): string {
  return names[id] ?? id.replace(/^[a-z]+-/, "");
}
