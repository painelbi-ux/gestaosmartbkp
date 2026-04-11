/** Carrega uma imagem pública como data URL (ex.: logo para jsPDF). */
export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Falha ao converter imagem'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
