import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RotateCcw, Check, Upload, Loader2 } from 'lucide-react';
import { Overlay } from './ui/index.js';

// Captura de selfie para o registro de ponto. Tenta a câmera frontal via
// getUserMedia (desenha num <canvas> e exporta JPEG); cai para <input file>
// com `capture="user"` quando a câmera não está disponível ou foi negada.
// SEMPRE encerra as tracks da câmera ao fechar/desmontar — nunca deixa a câmera ligada.
export default function CapturaSelfie({ aberto, onConfirmar, onCancelar }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  const [estado, setEstado] = useState('inicial'); // inicial | camera | semCamera | preview
  const [previewUrl, setPreviewUrl] = useState(null);
  const [iniciando, setIniciando] = useState(false);

  // Para o stream e libera a câmera. Idempotente.
  const pararCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const iniciarCamera = useCallback(async () => {
    setIniciando(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem-suporte');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setEstado('camera');
      // O <video> só existe após a troca de estado — anexa no próximo tick.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      // Sem permissão/suporte: oferece o fallback de upload.
      setEstado('semCamera');
    } finally {
      setIniciando(false);
    }
  }, []);

  // Ao abrir, tenta a câmera. Ao fechar/desmontar, garante o desligamento.
  useEffect(() => {
    if (aberto) {
      setPreviewUrl(null);
      setEstado('inicial');
      iniciarCamera();
    } else {
      pararCamera();
    }
    return () => pararCamera();
  }, [aberto, iniciarCamera, pararCamera]);

  function tirarFoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 480;
    const h = video.videoHeight || 640;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Espelha horizontalmente — a prévia da câmera frontal já vem espelhada,
    // então a selfie final fica como o usuário se vê.
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    pararCamera();
    setPreviewUrl(dataUrl);
    setEstado('preview');
  }

  function aoSelecionarArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      setPreviewUrl(String(leitor.result));
      setEstado('preview');
    };
    leitor.readAsDataURL(arquivo);
  }

  function refazer() {
    setPreviewUrl(null);
    iniciarCamera();
  }

  function confirmar() {
    if (previewUrl) onConfirmar(previewUrl);
  }

  function cancelar() {
    pararCamera();
    onCancelar();
  }

  return (
    <Overlay open={aberto} onClose={cancelar} title="Selfie do ponto" size="sm">
      {/* Área da imagem (câmera ao vivo, prévia ou estado sem câmera). `max-h`
          limita a altura em telas curtas para não empurrar as ações para fora. */}
      <div className="relative rounded-lg overflow-hidden bg-dark-900 border border-dark-600 aspect-[3/4] max-h-[50vh] shrink-0 flex items-center justify-center">
          {estado === 'preview' && previewUrl ? (
            <img src={previewUrl} alt="Prévia da selfie" className="w-full h-full object-cover" />
          ) : estado === 'camera' ? (
            // `-scale-x-100` espelha a prévia (efeito espelho natural de selfie).
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          ) : iniciando ? (
            <div className="flex flex-col items-center gap-2 text-muted">
              <Loader2 size={28} className="animate-spin text-accent-300" />
              <p className="text-sm">Abrindo a câmera…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted px-6 text-center">
              <Camera size={28} className="text-dark-500" />
              <p className="text-sm">Câmera indisponível. Envie uma foto do seu dispositivo.</p>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={aoSelecionarArquivo}
          className="hidden"
        />

        {/* Ações */}
        <div className="mt-4 flex flex-col gap-2 shrink-0">
          {estado === 'preview' ? (
            <>
              <button onClick={confirmar} className="btn-primary">
                <Check size={16} /> Usar esta foto
              </button>
              <button
                onClick={refazer}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-dark-600 bg-dark-700 px-4 py-2.5 text-sm font-medium text-muted hover:text-white transition-colors"
              >
                <RotateCcw size={16} /> Refazer
              </button>
            </>
          ) : estado === 'camera' ? (
            <button onClick={tirarFoto} className="btn-primary">
              <Camera size={16} /> Tirar foto
            </button>
          ) : (
            <button onClick={() => inputRef.current?.click()} className="btn-primary">
              <Upload size={16} /> Enviar foto
            </button>
          )}
        </div>
    </Overlay>
  );
}
