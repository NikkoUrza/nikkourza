# 🎵 Carpeta de Previews de Beats

Sube aquí tus archivos MP3 de preview (30–60 segundos con marca de agua).

## Archivos esperados

El sitio busca exactamente estos nombres:

| Beat | Archivo |
|------|---------|
| Noche Libre 808 | `noche-libre-808-preview.mp3` |
| Abismo Teal | `abismo-teal-preview.mp3` |
| Sin Permiso | `sin-permiso-preview.mp3` |
| Océano Profundo | `oceano-profundo-preview.mp3` |

## Cómo subir

1. Exporta el preview desde tu DAW como **MP3 320kbps** (o mínimo 128kbps)
2. Nómbralo exactamente como aparece arriba
3. Cópialo a esta carpeta `/beats/`
4. Haz commit y push a GitHub:

```bash
git add beats/
git commit -m "feat: agrego previews de beats"
git push origin main
```

¡Y listo! El player en nikkourza.com lo cargará automáticamente.

## Tips de producción del preview

- **Duración ideal:** 30–60 segundos
- **Watermark:** Agrega tu voz o un sample diciendo "NIKKO URZA" cada 15–20 segundos
- **Punto de entrada:** Que empiece desde el drop o la parte más atractiva del beat
- **Formato:** MP3 para que cargue rápido. Un MP3 de 60s a 320kbps pesa ~2.4MB
