import { describe, expect, it } from 'vitest';
import { escapeXml, layersToSvg } from '@/lib/render/scene';
import type { ImageLayer, TextLayer } from '@/lib/types';

const area = { width: 300, height: 380 };

const text: TextLayer = {
  id: 't',
  type: 'text',
  x: 150,
  y: 100,
  width: 120,
  height: 40,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  z: 2,
  text: 'Ginger & Co <script>',
  fontFamily: 'Georgia',
  fontSize: 28,
  fill: '#000000',
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAlign: 'center',
};

const image: ImageLayer = {
  id: 'i',
  type: 'image',
  x: 150,
  y: 200,
  width: 100,
  height: 100,
  scaleX: 1.5,
  scaleY: 1.5,
  angle: 0,
  z: 1,
  assetId: 'asset_1',
  opacity: 1,
};

describe('layersToSvg', () => {
  it('is the single renderer: text and images both render', () => {
    const svg = layersToSvg([text, image], {
      area,
      images: { asset_1: { href: 'data:image/png;base64,AAAA', width: 100, height: 100 } },
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('<text');
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,AAAA');
  });

  it('escapes text so a design cannot inject markup', () => {
    const svg = layersToSvg([text], { area });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('Ginger &amp; Co &lt;script&gt;');
  });

  it('orders by z-index so higher layers paint last', () => {
    const svg = layersToSvg([text, image], { area });
    expect(svg.indexOf('<image')).toBeLessThan(svg.indexOf('<text'));
  });

  it('scales the output box without changing the viewBox', () => {
    const svg = layersToSvg([text], { area, scale: 4 });
    expect(svg).toContain('viewBox="0 0 300 380"');
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="1520"');
  });
});

describe('escapeXml', () => {
  it('handles every reserved character', () => {
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&apos;');
  });
});
