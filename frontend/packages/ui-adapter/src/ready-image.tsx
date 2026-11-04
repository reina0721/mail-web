'use client';

import { useState, type CSSProperties, type SyntheticEvent } from 'react';
import type { ReactNode } from 'react';

type ReadyImageState = 'loading' | 'ready' | 'error';

export type ReadyImageProps = Readonly<{
  src: string;
  alt: string;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  loading?: 'eager' | 'lazy';
  error: ReactNode;
}>;

type ReadyImageStyle = CSSProperties & Readonly<Record<'--ready-image-width', string>>;

/** ReadyImage 预留媒体空间，并在浏览器 decode 完成后才显现真实图片。 */
export function ReadyImage({ src, ...props }: ReadyImageProps) {
  return <ReadyImageSource key={src} src={src} {...props} />;
}

function ReadyImageSource({
  src,
  alt,
  width,
  height,
  fit = 'cover',
  loading = 'lazy',
  error,
}: ReadyImageProps) {
  const [state, setState] = useState<ReadyImageState>('loading');

  const markReadyAfterDecode = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const markReady = () => setState('ready');
    if (typeof image.decode === 'function') {
      void image.decode().then(markReady, markReady);
      return;
    }
    markReady();
  };

  const style: ReadyImageStyle = {
    '--ready-image-width': `${width}px`,
    aspectRatio: `${width} / ${height}`,
  };

  return (
    <span
      aria-busy={state === 'loading' ? true : undefined}
      className="ui-ready-image rounded-control"
      data-motion-recipe="media"
      data-state={state}
      style={style}
    >
      {state === 'ready' ? null : (
        <span aria-hidden="true" className="ui-ready-image-placeholder animate-pulse" />
      )}
      {state === 'error' ? error : null}
      <img
        alt={alt}
        className={`ui-ready-image-element ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        height={height}
        loading={loading}
        src={src}
        width={width}
        onError={() => setState('error')}
        onLoad={markReadyAfterDecode}
      />
    </span>
  );
}
