import { useState, useEffect, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Upload, Search, Image as ImageIcon, Mic, Youtube, Link, X, Crop, RotateCw, Check } from 'lucide-react';
import { api } from '../api/client';

interface MediaItem {
  id: number; source_url: string; title: { rendered: string };
  media_type: string; mime_type: string; media_details?: { width: number; height: number };
}

interface CropArea { x: number; y: number; width: number; height: number; }

function mediaIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon size={24} className="text-blue" />;
  if (mime.startsWith('audio/')) return <Mic size={24} className="text-purple-400" />;
  if (mime.startsWith('video/')) return <Youtube size={24} className="text-danger" />;
  return <Link size={24} className="text-label" />;
}

async function getCroppedImage(imageSrc: string, cropArea: CropArea, rotation: number): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.setAttribute('crossOrigin', 'anonymous');
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d')!;
  const rad    = (rotation * Math.PI) / 180;
  const sin    = Math.abs(Math.sin(rad));
  const cos    = Math.abs(Math.cos(rad));

  const bw = image.width * cos + image.height * sin;
  const bh = image.width * sin + image.height * cos;

  canvas.width  = cropArea.width;
  canvas.height = cropArea.height;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.translate(-bw / 2, -bh / 2);
  ctx.drawImage(image, (bw - image.width) / 2, (bh - image.height) / 2);

  // Re-draw cropped region
  const output = document.createElement('canvas');
  output.width  = cropArea.width;
  output.height = cropArea.height;
  const outCtx = output.getContext('2d')!;
  outCtx.drawImage(canvas, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height);

  return new Promise((resolve, reject) => {
    output.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas is empty')), 'image/jpeg', 0.92);
  });
}

function ImageEditorModal({
  src, filename, onClose, onUpload,
}: { src: string; filename: string; onClose: () => void; onUpload: (blob: Blob, name: string) => void }) {
  const [crop, setCrop]           = useState({ x: 0, y: 0 });
  const [zoom, setZoom]           = useState(1);
  const [rotation, setRotation]   = useState(0);
  const [aspect, setAspect]       = useState(16 / 9);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_: any, pixels: CropArea) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleUpload() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedImage(src, croppedAreaPixels, rotation);
      onUpload(blob, filename.replace(/\.[^.]+$/, '') + '_cropped.jpg');
    } catch { alert('خطا در پردازش تصویر'); }
    finally { setProcessing(false); }
  }

  const aspects = [
    { label: '۱۶:۹', value: 16 / 9 },
    { label: '۴:۳',  value: 4 / 3 },
    { label: '۱:۱',  value: 1 },
    { label: 'آزاد', value: 0 },
  ];

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <button onClick={onClose} className="text-label hover:text-white p-1">
          <X size={20} />
        </button>
        <h2 className="text-white font-semibold text-sm">ویرایش تصویر</h2>
        <button
          onClick={handleUpload}
          disabled={processing}
          className="bg-blue text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50"
        >
          <Check size={14} />
          {processing ? 'پردازش...' : 'آپلود'}
        </button>
      </div>

      {/* Cropper */}
      <div className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect || undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* Controls */}
      <div className="bg-surface border-t border-border p-4 space-y-3" dir="rtl">
        {/* Aspect ratio */}
        <div className="flex gap-2">
          {aspects.map(a => (
            <button key={a.label}
              onClick={() => setAspect(a.value)}
              className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                aspect === a.value
                  ? 'bg-blue/20 border-blue text-blue'
                  : 'bg-bg border-border text-label hover:text-white'
              }`}>
              {a.label}
            </button>
          ))}
        </div>

        {/* Zoom */}
        <div>
          <label className="text-label text-xs mb-1 block">بزرگنمایی</label>
          <input type="range" min={1} max={3} step={0.05} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="w-full accent-blue" />
        </div>

        {/* Rotation */}
        <div className="flex items-center gap-3">
          <label className="text-label text-xs">چرخش</label>
          <button onClick={() => setRotation(r => (r - 90 + 360) % 360)}
            className="flex items-center gap-1 text-label hover:text-white text-xs border border-border px-2 py-1 rounded-lg">
            <RotateCw size={12} className="scale-x-[-1]" /> ۹۰°
          </button>
          <button onClick={() => setRotation(r => (r + 90) % 360)}
            className="flex items-center gap-1 text-label hover:text-white text-xs border border-border px-2 py-1 rounded-lg">
            <RotateCw size={12} /> ۹۰°
          </button>
          <span className="text-blue text-xs mr-auto">{rotation}°</span>
        </div>
      </div>
    </div>
  );
}

export default function MediaLibrary() {
  const [items, setItems]       = useState<MediaItem[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [total, setTotal]       = useState(0);
  const [editorSrc, setEditorSrc] = useState<string | null>(null);
  const [editorName, setEditorName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [search]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/wp/media', { params: { search, per_page: 20 } });
      setItems(data.media || []);
      setTotal(data.total || 0);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setEditorSrc(url);
      setEditorName(file.name);
    } else {
      uploadFile(file);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function uploadFile(file: File | Blob, name?: string) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file, name || (file as File).name || 'upload.jpg');
    try {
      await api.post('/wp/media', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.error || 'خطا در آپلود');
    } finally { setUploading(false); }
  }

  function handleEditorUpload(blob: Blob, name: string) {
    setEditorSrc(null);
    uploadFile(blob, name);
  }

  return (
    <div className="p-4 pb-28" dir="rtl">
      {editorSrc && (
        <ImageEditorModal
          src={editorSrc}
          filename={editorName}
          onClose={() => setEditorSrc(null)}
          onUpload={handleEditorUpload}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white font-bold text-xl">کتابخانه مدیا</h1>
        <span className="text-label text-xs">{total} آیتم</span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-label" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="جستجو در مدیا..."
          className="w-full bg-surface border border-border rounded-xl pr-9 pl-4 py-3 text-white placeholder-label text-sm focus:outline-none focus:border-blue"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl h-32 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map(item => (
            <div key={item.id}
              className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-blue/40 transition-colors">
              {item.mime_type.startsWith('image/') ? (
                <img src={item.source_url} alt={item.title.rendered}
                  className="w-full h-24 object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-bg">
                  {mediaIcon(item.mime_type)}
                </div>
              )}
              <div className="p-2">
                <p className="text-white text-xs truncate">{item.title.rendered || 'بدون عنوان'}</p>
                <p className="text-label text-xs">{item.mime_type.split('/')[1]}</p>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="col-span-2 text-center text-label py-12">
              <ImageIcon size={40} className="mx-auto mb-2 opacity-30" />
              <p>فایلی یافت نشد</p>
            </div>
          )}
        </div>
      )}

      {/* Upload button */}
      <input ref={fileRef} type="file" accept="image/*,audio/*,video/*" onChange={handleFileSelect} className="hidden" />
      <div className="fixed bottom-20 left-0 right-0 px-4">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full bg-blue text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-hover transition-colors disabled:opacity-50 shadow-lg shadow-blue/20"
        >
          {uploading ? <Upload size={18} /> : <Crop size={18} />}
          {uploading ? 'در حال آپلود...' : 'انتخاب و ویرایش تصویر'}
        </button>
      </div>
    </div>
  );
}
