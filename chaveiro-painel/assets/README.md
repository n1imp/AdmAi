# Assets de origem do app (ícone + splash)

O comando `npm run cap:assets` (`@capacitor/assets`) gera **todos** os ícones adaptativos
e telas de splash do Android a partir dos arquivos desta pasta. Coloque aqui a arte final
e rode o comando — os arquivos gerados vão para `android/app/src/main/res/`.

## Arquivos esperados (PNG)

| Arquivo | Tamanho | Obrigatório | Uso |
|---|---|---|---|
| `icon-only.png` | 1024×1024 | sim | Ícone do app (camada principal) |
| `icon-foreground.png` | 1024×1024 | recomendado | Camada de frente do ícone adaptativo |
| `icon-background.png` | 1024×1024 | recomendado | Camada de fundo (cor sólida ou textura) |
| `splash.png` | 2732×2732 | recomendado | Tela de abertura (tema claro) |
| `splash-dark.png` | 2732×2732 | opcional | Tela de abertura (tema escuro) |

Sem `icon-foreground/background`, o gerador usa `icon-only.png` para tudo.

## Como gerar

```bash
cd chaveiro-painel
npm run cap:assets          # gera ícones + splash no projeto android/
npm run cap:sync            # sincroniza os assets web no app
```

> A logo de referência atual está em `public/icons/icon.svg`. Exporte-a (ou a arte
> definitiva) como `icon-only.png` 1024×1024 antes de gerar. Esta pasta é versionada;
> os PNGs de origem podem ser commitados (não são segredos).
