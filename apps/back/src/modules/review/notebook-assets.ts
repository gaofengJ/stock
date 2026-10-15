import { NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EntityManager } from 'typeorm';
import { NotebookContent, parseNotebook } from './notebook.content';

const assetPattern = /^review-asset:([a-f0-9]{64})$/;
const token = (hash: string) => `review-asset:${hash}`;

/** Only server-validated inline images enter storage; references are internal. */
export async function storeNotebookImages(
  manager: EntityManager,
  owner: number,
  content: NotebookContent,
): Promise<NotebookContent> {
  if (!content.article?.images.length) return content;
  const images = new Map<string, string>();
  const article = {
    ...content.article,
    images: content.article.images.map((image) => {
      const hash = createHash('sha256').update(image.data).digest('hex');
      images.set(hash, image.data);
      return { ...image, data: token(hash) };
    }),
  };
  const hashes = [...images.keys()];
  const existing: { hash: string }[] = await manager.query(
    `SELECT image_hash hash FROM t_review_image WHERE user_id=? AND image_hash IN (${hashes
      .map(() => '?')
      .join(',')})`,
    [owner, ...hashes],
  );
  existing.forEach(({ hash }) => images.delete(hash));
  if (images.size)
    await manager.query(
      `INSERT INTO t_review_image(user_id,image_hash,data) VALUES ${[...images]
        .map(() => '(?,?,?)')
        .join(',')} ON DUPLICATE KEY UPDATE image_hash=VALUES(image_hash)`,
      [...images].flatMap(([hash, data]) => [owner, hash, data]),
    );
  return { ...content, article };
}

interface PublicationAssets {
  body: string;
  imageRefs?: string | null;
}

/** Resolve only structured image fields, never markers in user-authored text. */
export async function hydrateNotebookAssets(
  manager: Pick<EntityManager, 'query'>,
  owner: number,
  texts: string[],
  publications: PublicationAssets[] = [],
): Promise<{ notebooks: string[]; bodies: string[] }> {
  const notebooks: NotebookContent[] = texts.map((text) => JSON.parse(text));
  const publicationImages: { id: string; data: string }[][] = publications.map(
    (item) => (item.imageRefs ? JSON.parse(item.imageRefs) : []),
  );
  const allImages = [
    ...notebooks.flatMap((item) => item.article?.images || []),
    ...publicationImages.flat(),
  ];
  const hashes = [
    ...new Set(
      allImages.flatMap(({ data }) => {
        const match = assetPattern.exec(data);
        return match ? [match[1]] : [];
      }),
    ),
  ];
  const rows: { hash: string; data: string }[] = hashes.length
    ? await manager.query(
        `SELECT image_hash hash,data FROM t_review_image WHERE user_id=? AND image_hash IN (${hashes
          .map(() => '?')
          .join(',')})`,
        [owner, ...hashes],
      )
    : [];
  const images = new Map(rows.map((row) => [row.hash, row.data]));
  const resolveImage = (value: string) => {
    const match = assetPattern.exec(value);
    if (!match) return value;
    const data = images.get(match[1]);
    if (!data) throw new NotFoundException('复盘图片不存在，请重新加载记录');
    return data;
  };
  return {
    notebooks: notebooks.map((item) =>
      JSON.stringify({
        ...item,
        ...(item.article
          ? {
              article: {
                ...item.article,
                images: item.article.images.map((image) => ({
                  ...image,
                  data: resolveImage(image.data),
                })),
              },
            }
          : {}),
      }),
    ),
    bodies: publications.map((item, index) =>
      publicationImages[index].reduce(
        (body, image) =>
          body
            .split(`](review-image:${image.id})`)
            .join(`](${resolveImage(image.data)})`),
        item.body,
      ),
    ),
  };
}

export async function readNotebookContent(
  manager: Pick<EntityManager, 'query'>,
  owner: number,
  raw: string,
) {
  const {
    notebooks: [content],
  } = await hydrateNotebookAssets(manager, owner, [raw]);
  return parseNotebook(content);
}

/** References are an opt-in transport only. Saves still require validated inline images. */
export function notebookAssetReferences(raw: string): NotebookContent {
  const value = JSON.parse(raw);
  const original = value.article?.images;
  if (Array.isArray(original)) {
    value.article.images = original.map((image) => ({
      ...image,
      data: assetPattern.test(image.data)
        ? 'data:image/png;base64,iVBORw0KGgo='
        : image.data,
    }));
  }
  const parsed = parseNotebook(JSON.stringify(value));
  if (parsed.article)
    parsed.article.images = parsed.article.images.map((image, index) => ({
      ...image,
      data: original[index].data,
    }));
  return parsed;
}
