# Identidade visual do CALOPSIA

O logo oficial fornecido está preservado em `logo-official-source.png`.

Arquivos utilizados pelo Electron e pelos instaladores:

- `icon.png` — PNG quadrado 1024×1024 para Linux, janela e interface;
- `icon.icns` — ícone multi-resolução para macOS;
- `icon.ico` — ícone multi-resolução para Windows.

Para recriar os três arquivos a partir da imagem original:

```bash
python3 -m pip install Pillow
python3 scripts/generate-icons.py
```

O script recorta somente a área visível do logo, mantém a proporção e adiciona margem transparente em uma tela quadrada, evitando deformação nos instaladores.
