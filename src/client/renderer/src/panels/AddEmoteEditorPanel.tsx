import React, { useEffect, useRef, useState } from 'react';
import ModalWindowPanel from '../components/ModalWindowPanel';
import Button from '../components/Button';
import TextField from '../components/TextField';
import Slider from '../components/Slider';

interface AddEmoteEditorPanelProps {
  file: File;
  onFinish: (name: string, blob: Blob | File) => Promise<void>;
  onClose: () => void;
}

const FRAME_SIZE = 320;
const CANVAS_SIZE = 480;

const generateRandomName = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  for (let i = 0; i < 6; i++) {
    name += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return name;
};

const AddEmoteEditorPanel: React.FC<AddEmoteEditorPanelProps> = ({ file, onFinish, onClose }) => {
  const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
  const [fileUrl] = useState(() => URL.createObjectURL(file));
  const [editorName, setEditorName] = useState(() => generateRandomName());
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewLargeRef = useRef<HTMLCanvasElement | null>(null);
  const previewSmallRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef({ active: false, lastX: 0, lastY: 0 });

  // Revoke object URL on unmount
  useEffect(() => {
    return () => { URL.revokeObjectURL(fileUrl); };
  }, [fileUrl]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const iw = img.width;
    const ih = img.height;
    const baseScale = FRAME_SIZE / Math.max(iw, ih);
    const drawW = iw * baseScale * zoom;
    const drawH = ih * baseScale * zoom;
    const cx = CANVAS_SIZE / 2 + offset.x;
    const cy = CANVAS_SIZE / 2 + offset.y;
    const rad = (rotation % 360) * Math.PI / 180;
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const updatePreview = (ref: React.RefObject<HTMLCanvasElement | null>, outSize: number) => {
      const p = ref.current;
      if (!p) return;
      p.width = outSize;
      p.height = outSize;
      const pc = p.getContext('2d');
      if (!pc) return;
      pc.clearRect(0, 0, outSize, outSize);
      const cropOffset = (CANVAS_SIZE - FRAME_SIZE) / 2;
      pc.drawImage(canvas, cropOffset, cropOffset, FRAME_SIZE, FRAME_SIZE, 0, 0, outSize, outSize);
    };
    updatePreview(previewLargeRef, 64);
    updatePreview(previewSmallRef, 40);
  };

  // Load image and draw
  useEffect(() => {
    const img = new Image();
    img.src = fileUrl;
    imgRef.current = img;
    img.onload = () => drawCanvas();
    return () => { imgRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // Redraw on transform changes
  useEffect(() => { drawCanvas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [zoom, offset, rotation]);

  const startDrag = (ev: React.MouseEvent) => {
    dragging.current = { active: true, lastX: ev.clientX, lastY: ev.clientY };
  };
  const endDrag = () => { dragging.current.active = false; };
  const onPointerMove = (ev: React.MouseEvent) => {
    if (!dragging.current.active) return;
    const dx = ev.clientX - dragging.current.lastX;
    const dy = ev.clientY - dragging.current.lastY;
    dragging.current.lastX = ev.clientX;
    dragging.current.lastY = ev.clientY;
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const resetTransform = () => { setZoom(1); setOffset({ x: 0, y: 0 }); setRotation(0); };

  const fillFrame = () => {
    const img = imgRef.current;
    if (!img) return;
    const baseScale = FRAME_SIZE / Math.max(img.width, img.height);
    const fillScale = FRAME_SIZE / Math.min(img.width, img.height);
    setZoom(fillScale / baseScale);
    setOffset({ x: 0, y: 0 });
  };

  const fitFrame = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleFinish = async () => {
    if (isGif) {
      await onFinish(editorName, file);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = FRAME_SIZE;
    cropCanvas.height = FRAME_SIZE;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;
    const cropOffset = (CANVAS_SIZE - FRAME_SIZE) / 2;
    cropCtx.drawImage(canvas, cropOffset, cropOffset, FRAME_SIZE, FRAME_SIZE, 0, 0, FRAME_SIZE, FRAME_SIZE);
    await new Promise<void>((resolve) => {
      cropCanvas.toBlob(async (blob) => {
        if (!blob) { resolve(); return; }
        await onFinish(editorName, blob);
        resolve();
      }, 'image/png');
    });
  };

  return (
    <ModalWindowPanel
      className="emoji-editor-modal emoji-editor-modal--splitview"
      asidePosition="right"
      asideWidth="280px"
      aside={(
        <div className="emoji-editor-aside">
          <div className="emoji-editor-aside__section">
            <div className="emoji-editor-aside__label">Preview</div>
            <div className="emoji-editor-aside__previews">
              <div className="emoji-preview-box">
                <div className="emoji-preview-reaction">
                  <div className="emoji-preview-reaction__icon">
                    {isGif ? (
                      <img src={fileUrl} alt="preview" />
                    ) : (
                      <canvas ref={previewSmallRef} />
                    )}
                  </div>
                  <span className="emoji-preview-reaction__count">6</span>
                </div>
              </div>
              <div className="emoji-preview-box">
                <div className="emoji-preview-tile">
                  {isGif ? (
                    <img src={fileUrl} alt="preview" />
                  ) : (
                    <canvas ref={previewLargeRef} />
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="emoji-editor-aside__section">
            <TextField label="Emote name *" value={editorName} onChange={(e) => setEditorName(e.target.value)} />
          </div>
          <div className="emoji-editor-aside__actions">
            <Button variant="primary" onClick={handleFinish} style={{ width: '100%' }}>Finish</Button>
          </div>
        </div>
      )}
    >
      <div className="emoji-editor-main">
        <div className="emoji-editor-main__header">
          <button className="emoji-editor-main__close icon-btn" aria-label="Close" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
          <h3 className="emoji-editor-main__title">
            Add Emote
            {isGif && <span className="emoji-editor-gif-badge">GIF</span>}
          </h3>
          {!isGif && (
            <button className="emoji-editor-main__reset icon-btn" title="Reset" onClick={resetTransform}>
              <i className="fas fa-undo" />
            </button>
          )}
        </div>

        <div className="emoji-editor-stage" onMouseDown={!isGif ? startDrag : undefined} onMouseMove={!isGif ? onPointerMove : undefined} onMouseUp={!isGif ? endDrag : undefined} onMouseLeave={!isGif ? endDrag : undefined}>
          {isGif ? (
            <div className="emoji-editor-gif-preview" style={{ width: FRAME_SIZE, height: FRAME_SIZE }}>
              <img src={fileUrl} alt="GIF preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ) : (
            <div className="emoji-editor-canvas-wrapper" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, position: 'relative' }}>
              <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} />
              <div className="emoji-editor-frame" style={{ width: FRAME_SIZE, height: FRAME_SIZE }} aria-hidden />
            </div>
          )}
          <p className="emoji-editor-hint">{isGif ? 'GIF will be uploaded as-is' : 'Drag image to reposition'}</p>
        </div>

        {!isGif && (
          <div className="emoji-editor-controls">
            <div className="emoji-editor-controls__left">
              <button className="icon-btn emoji-editor-text-btn" title="Fill frame" onClick={fillFrame}>Fill</button>
              <button className="icon-btn emoji-editor-text-btn" title="Fit to frame" onClick={fitFrame}>Fit</button>
            </div>
            <div className="emoji-editor-controls__center">
              <button className="icon-btn" onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="Zoom out"><i className="fas fa-search-minus" /></button>
              <Slider
                className="emoji-editor-slider"
                value={zoom}
                min={0.25}
                max={3}
                step={0.01}
                onChange={setZoom}
                ariaLabel="Zoom"
              />
              <button className="icon-btn" onClick={() => setZoom(z => Math.min(3, z + 0.1))} title="Zoom in"><i className="fas fa-search-plus" /></button>
            </div>
          </div>
        )}
      </div>
    </ModalWindowPanel>
  );
};

export default AddEmoteEditorPanel;
