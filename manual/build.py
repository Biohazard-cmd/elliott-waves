# Собирает инструкцию в один файл: картинки из img/ вставляются внутрь (работает без интернета).
# python3 build.py → «Инструкция (пример).html»
import base64, re, pathlib
here = pathlib.Path(__file__).parent
html = (here / 'template.html').read_text(encoding='utf-8')
def embed(m):
    data = base64.b64encode((here / m.group(1)).read_bytes()).decode()
    return 'src="data:image/jpeg;base64,' + data + '"'
html = re.sub(r'src="(img/[^"]+\.jpg)"', embed, html)
html = html.replace('/*@EXAMPLES@*/null', (here / 'data' / 'examples.json').read_text(encoding='utf-8'))   # настоящие примеры: research/manual_examples.js
out = here / 'Инструкция (пример).html'
out.write_text(html, encoding='utf-8')
print(out.name, round(out.stat().st_size / 1024), 'КБ')
