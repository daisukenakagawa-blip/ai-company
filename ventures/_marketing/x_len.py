# X の文字数（重み付き）を数える。python3 ventures/_marketing/x_len.py "本文"
# 無料の X アカウントは 280 まで。日本語・全角は1文字=2、半角は1、URL は長さに関係なく23。
import re, sys
def weighted(t):
    n = 0
    for u in re.findall(r'https?://\S+', t):
        n += 23; t = t.replace(u, '', 1)
    for ch in t:
        c = ord(ch)
        n += 1 if (c <= 4351 or 8192 <= c <= 8205 or 8208 <= c <= 8223 or 8242 <= c <= 8247) else 2
    return n
if __name__ == "__main__":
    s = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    n = weighted(s); print(n, "OK" if n <= 280 else "長すぎ（280 まで）")
