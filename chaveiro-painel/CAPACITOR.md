# App Android (Capacitor) — ChaveiroBot

O app Android é um wrapper [Capacitor](https://capacitorjs.com/) sobre o painel React
deste diretório. Ele empacota o build estático (`dist/`) num WebView nativo e reaproveita
100% da UI existente. Já está com o projeto nativo gerado em `android/`.

- **appId:** `com.chaveirobot.app`  ·  **appName:** `ChaveiroBot`  ·  **webDir:** `dist`
- Config: [`capacitor.config.json`](./capacitor.config.json)

## Pré-requisitos (na máquina de build)

- Node 20+ e as dependências do painel (`npm ci`).
- **Android Studio** (SDK + Platform Tools) e **JDK 17**.
- Para gerar o `.aab` de release: `keytool` (vem com o JDK).

## Como a API é resolvida (importante)

O painel web chama `/api` (mesma origem, via proxy do nginx). O app **não** tem essa origem,
então o cliente HTTP usa uma base **absoluta** vinda de `VITE_API_URL`
(ver `src/lib/api.js`). Defina-a **no build do app**:

```bash
# PowerShell
$env:VITE_API_URL = 'https://api.SEU_DOMINIO'   # backend de produção (HTTPS)
npm run cap:sync                                  # = vite build + npx cap sync
```

> CORS: o backend permite **uma** origem (`ALLOWED_ORIGIN`). Para evitar bloqueio CORS no app,
> o `capacitor.config.json` ativa o **CapacitorHttp** (`plugins.CapacitorHttp.enabled = true`):
> as requisições saem pela camada nativa, sem CORS. Não é preciso mexer no backend.

## Fluxo de desenvolvimento

```bash
$env:VITE_API_URL = 'https://api.SEU_DOMINIO'
npm run cap:sync          # build + copia web assets para android/
npm run cap:open          # abre no Android Studio (Run ▶ em emulador/dispositivo)
# ou, com SDK no PATH:
npx cap run android
```

## Permissões nativas (câmera + localização)

A batida de ponto usa APIs web — `getUserMedia` em `src/components/CapturaSelfie.jsx` e
`navigator.geolocation` em `src/pages/MeuPonto.jsx`. As permissões já estão declaradas em
`android/app/src/main/AndroidManifest.xml`:

- `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` (e `INTERNET`, padrão).

O WebView do Capacitor pede a permissão de runtime na primeira vez que a câmera/GPS é usada.
**Teste em dispositivo real** (a verificação do plano cobre isso). Se o prompt de runtime não
aparecer em algum aparelho, o fallback robusto é instalar os plugins oficiais e pedir a permissão
no start do app:

```bash
npm i @capacitor/camera @capacitor/geolocation
# em src/main.jsx, no boot: Camera.requestPermissions() / Geolocation.requestPermissions()
```

## Build de release assinado (.aab para a Play Store)

1. **Gerar o keystore de upload** (uma vez; guarde com segurança e faça backup):
   ```bash
   keytool -genkey -v -keystore chaveirobot-upload.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias upload
   ```
2. **Configurar a assinatura** em `android/app/build.gradle` (bloco `signingConfigs` +
   `buildTypes.release`), lendo as senhas de variáveis de ambiente ou de
   `android/keystore.properties` (NÃO commitar o `.jks` nem as senhas).
3. **Gerar o bundle**:
   ```bash
   $env:VITE_API_URL = 'https://api.SEU_DOMINIO'
   npm run cap:sync
   cd android
   ./gradlew bundleRelease        # gera app/build/outputs/bundle/release/app-release.aab
   ```
4. Use **Play App Signing** no Console: você sobe o `.aab` assinado com a chave de upload; o
   Google gerencia a chave de assinatura final. Confirme o `targetSdkVersion` exigido pela Play
   em `android/variables.gradle`.

## Ícone e splash

Hoje há apenas `public/icons/icon.svg`. Gere os ícones adaptativos + splash:

```bash
npm i -D @capacitor/assets
# coloque um icon.png (1024x1024) e splash.png em ./assets/ e rode:
npx capacitor-assets generate --android
```

## O que versionar

O diretório `android/` deve ser commitado (já traz seu próprio `.gitignore` para `build/`,
`.gradle/`, etc.). **NUNCA** commite o keystore `.jks` nem `keystore.properties`/senhas.
