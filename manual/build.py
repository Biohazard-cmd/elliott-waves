# Собирает инструкцию в один файл: картинки из img/ вставляются внутрь (работает без интернета).
# python3 build.py → «Инструкция.html» и та же страница в приложении: android/assets/manual.html (3.8, кнопки 📖)
import base64, re, pathlib
here = pathlib.Path(__file__).parent
html = (here / 'template.html').read_text(encoding='utf-8')
def embed(m):
    data = base64.b64encode((here / m.group(1)).read_bytes()).decode()
    return 'src="data:image/jpeg;base64,' + data + '"'
html = re.sub(r'src="(img/[^"]+\.jpg)"', embed, html)
html = html.replace('/*@EX4@*/null', (here / 'data' / 'examples4h.json').read_text(encoding='utf-8'))   # сделки роботов на 4ч: research/manual_4h.js
html = html.replace('/*@SWING@*/null', (here / 'data' / 'swing.json').read_text(encoding='utf-8'))   # порог разворота: research/manual_swing.js
html = html.replace('/*@EXAMPLES@*/null', (here / 'data' / 'examples.json').read_text(encoding='utf-8'))   # настоящие примеры: research/manual_examples.js
out = here / 'Инструкция.html'
out.write_text(html, encoding='utf-8')
(here.parent / 'android' / 'assets' / 'manual.html').write_text(html, encoding='utf-8')   # одинаковый файл — git хранит его один раз
print(out.name, round(out.stat().st_size / 1024), 'КБ, и android/assets/manual.html')
