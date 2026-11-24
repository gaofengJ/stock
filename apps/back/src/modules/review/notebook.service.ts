/* eslint-disable no-restricted-syntax, no-await-in-loop -- Owner-scoped table deletes share one ordered transaction. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  hydrateNotebookAssets,
  notebookAssetReferences,
  readNotebookContent,
  storeNotebookImages,
} from './notebook-assets';
import { parseNotebook, publicationText } from './notebook.content';
import { NotebookPublishDto, NotebookSaveDto } from './notebook.dto';

interface Observation {
  tsCode: string;
  name: string;
}
interface NotebookDate {
  date: string;
  revision: number;
  updatedAt: Date;
}
interface StoredObservations {
  picks?: string;
  legacyEvidence?: string;
}
interface CandidateReports {
  report(date: string): Promise<{
    items: { tsCode: string; capState: string; risk: { state: string } }[];
  }>;
}
const observationFields = `JSON_UNQUOTE(JSON_EXTRACT(content,'$.workspace.draft.selected')) picks,
  CASE WHEN JSON_EXTRACT(content,'$.workspace.draft.selected') IS NULL
    THEN JSON_UNQUOTE(JSON_EXTRACT(content,'$.private.toolEvidence')) END legacyEvidence`;
function savedObservations(row?: StoredObservations): Observation[] {
  if (row?.picks) return JSON.parse(row.picks);
  return Array.from(
    (row?.legacyEvidence || '').matchAll(
      /^(.+?) (\d{6}\.(?:SH|SZ|BJ))\n策略：/gm,
    ),
    ([, name, tsCode]) => ({ name, tsCode }),
  );
}

@Injectable()
export class NotebookService {
  constructor(
    private db: DataSource,
    private reviews: CandidateReports,
  ) {}

  async list(owner: number, stock = '') {
    const keyword = stock.trim().toLowerCase();
    const fields = 'trade_date date,revision,updated_at updatedAt';
    const rows = await this.db.query<(NotebookDate & StoredObservations)[]>(
      `SELECT ${fields}${
        keyword ? `,${observationFields}` : ''
      } FROM t_review_notebook WHERE user_id=? ORDER BY trade_date DESC`,
      [owner],
    );
    if (!keyword) return rows;
    return rows
      .filter((row: StoredObservations) =>
        savedObservations(row).some(({ name, tsCode }) =>
          `${name} ${tsCode}`.toLowerCase().includes(keyword),
        ),
      )
      .map(({ date, revision, updatedAt }) => ({ date, revision, updatedAt }));
  }

  private async validateAdditions(
    owner: number,
    dto: NotebookSaveDto,
    selected: Observation[],
  ) {
    if (!selected.length) return;
    const [stored] = dto.revision
      ? await this.db.query(
          `SELECT revision,${observationFields} FROM t_review_notebook WHERE user_id=? AND trade_date=?`,
          [owner, dto.date],
        )
      : [];
    if (dto.revision && Number(stored?.revision) !== dto.revision)
      throw new ConflictException(
        '其他页面已保存新版本，请先导出本地内容，再重新加载比较',
      );
    const existing = new Set(
      savedObservations(stored).map((pick) => pick.tsCode),
    );
    const additions = selected.filter((pick) => !existing.has(pick.tsCode));
    if (!additions.length) return;
    // Fetch market data before taking the write lock. The transaction rechecks the revision.
    const { items } = await this.reviews.report(dto.date);
    const eligible = new Set(
      items
        .filter(
          (row) => row.capState === 'within' && row.risk.state !== 'excluded',
        )
        .map((row) => row.tsCode),
    );
    const rejected = additions.filter((pick) => !eligible.has(pick.tsCode));
    if (rejected.length)
      throw new BadRequestException(
        `${rejected
          .map((pick) => pick.tsCode)
          .join(
            '、',
          )} 未通过当日候选、市值或风险核验，请更新候选或移出观察名单后再保存`,
      );
  }

  async read(
    owner: number,
    date: string,
    revision?: number,
    publicationBodies = true,
    previous = true,
    assetReferences = false,
  ) {
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.readSnapshot(
        manager,
        owner,
        date,
        revision,
        publicationBodies,
        previous,
        assetReferences,
      ),
    );
  }

  private async readSnapshot(
    manager: EntityManager,
    owner: number,
    date: string,
    revision: number | undefined,
    publicationBodies: boolean,
    includePrevious: boolean,
    assetReferences: boolean,
  ) {
    const [state] = await manager.query(
      'SELECT generation FROM t_review_notebook_state WHERE user_id=?',
      [owner],
    );
    const [item] = revision
      ? await manager.query(
          'SELECT revision,content,created_at updatedAt FROM t_review_notebook_version WHERE user_id=? AND trade_date=? AND revision=?',
          [owner, date, revision],
        )
      : await manager.query(
          'SELECT revision,content,updated_at updatedAt FROM t_review_notebook WHERE user_id=? AND trade_date=?',
          [owner, date],
        );
    if (revision && !item) throw new NotFoundException('版本不存在');
    const [previous] = includePrevious
      ? await manager.query(
          'SELECT trade_date date,revision,content FROM t_review_notebook WHERE user_id=? AND trade_date<? ORDER BY trade_date DESC LIMIT 1',
          [owner, date],
        )
      : [];
    const versions = await manager.query(
      'SELECT revision,created_at createdAt FROM t_review_notebook_version WHERE user_id=? AND trade_date=? ORDER BY revision DESC LIMIT 100',
      [owner, date],
    );
    const publications = await manager.query(
      `SELECT id,revision,channel,url,${
        publicationBodies ? 'body,image_refs imageRefs,' : ''
      }created_at createdAt FROM t_review_publication WHERE user_id=? AND trade_date=? ORDER BY id DESC LIMIT 100`,
      [owner, date],
    );
    const {
      notebooks: [currentContent, previousContent],
      bodies,
    } = await hydrateNotebookAssets(
      manager,
      owner,
      assetReferences ? [] : [item?.content || '{}', previous?.content || '{}'],
      publicationBodies ? publications : [],
    );
    const content = assetReferences
      ? () => notebookAssetReferences(item.content)
      : () => parseNotebook(currentContent);
    return {
      date,
      generation: Number(state?.generation || 0),
      revision: Number(item?.revision || 0),
      content: item ? content() : null,
      updatedAt: item?.updatedAt,
      previous: previous
        ? {
            ...previous,
            content: assetReferences
              ? notebookAssetReferences(previous.content)
              : parseNotebook(previousContent),
          }
        : null,
      versions,
      publications: publications.map(
        (row: { imageRefs?: string }, index: number) => {
          const publication = { ...row };
          delete publication.imageRefs;
          return {
            ...publication,
            ...(publicationBodies ? { body: bodies[index] } : {}),
          };
        },
      ),
    };
  }

  async image(owner: number, hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new NotFoundException('图片不存在');
    const [row] = await this.db.query(
      'SELECT data FROM t_review_image WHERE user_id=? AND image_hash=?',
      [owner, hash],
    );
    const match = row?.data?.match(
      /^data:image\/(png|jpeg);base64,([a-zA-Z0-9+/]+={0,2})$/,
    );
    if (!match) throw new NotFoundException('图片不存在');
    return { type: `image/${match[1]}`, data: Buffer.from(match[2], 'base64') };
  }

  async save(owner: number, dto: NotebookSaveDto) {
    const parsed = parseNotebook(dto.content);
    const { research } = parsed;
    if (research && research.date !== dto.date)
      throw new BadRequestException('资料日期与复盘日期不一致');
    const selected =
      parsed.workspace?.draft.selected ??
      savedObservations({ legacyEvidence: parsed.private.toolEvidence });
    await this.validateAdditions(owner, dto, selected);
    return this.db.transaction(async (m) => {
      await m.query(
        'INSERT INTO t_review_notebook_state(user_id,generation) VALUES(?,0) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',
        [owner],
      );
      const [state] = await m.query(
        'SELECT generation FROM t_review_notebook_state WHERE user_id=? FOR UPDATE',
        [owner],
      );
      if (Number(state.generation) !== (dto.generation || 0))
        throw new ConflictException('复盘记录已清空，请刷新页面后开始新记录');
      await m.query(
        'INSERT INTO t_review_notebook(user_id,trade_date,revision,content) VALUES(?,?,0,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',
        [owner, dto.date, '{}'],
      );
      const [row] = await m.query(
        'SELECT revision,content FROM t_review_notebook WHERE user_id=? AND trade_date=? FOR UPDATE',
        [owner, dto.date],
      );
      if (Number(row.revision) !== dto.revision)
        throw new ConflictException(
          '其他页面已保存新版本，请先导出本地内容，再重新加载比较',
        );
      // Record-only saves retain the exact stored article and its owner-scoped image references.
      let next = parsed;
      if (dto.mode === 'record') {
        if (parsed.article)
          throw new BadRequestException('记录保存不接受图文正文');
        const { article } = JSON.parse(row.content);
        if (article) next = { ...parsed, article };
      } else {
        next = await storeNotebookImages(m, owner, parsed);
      }
      const content = JSON.stringify(next);
      const revision = dto.revision + 1;
      await m.query(
        'UPDATE t_review_notebook SET revision=?,content=?,updated_at=UTC_TIMESTAMP(3) WHERE user_id=? AND trade_date=?',
        [revision, content, owner, dto.date],
      );
      await m.query(
        'INSERT INTO t_review_notebook_version(user_id,trade_date,revision,content) VALUES(?,?,?,?)',
        [owner, dto.date, revision, content],
      );
      return { revision };
    });
  }

  async clear(owner: number) {
    return this.db.transaction(async (m) => {
      await m.query(
        'INSERT INTO t_review_notebook_state(user_id,generation) VALUES(?,0) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',
        [owner],
      );
      await m.query(
        'SELECT generation FROM t_review_notebook_state WHERE user_id=? FOR UPDATE',
        [owner],
      );
      const removed: Record<string, number> = {};
      for (const table of [
        't_review_publication',
        't_review_notebook_version',
        't_review_notebook',
        't_review_image',
      ]) {
        const result = await m.query(`DELETE FROM ${table} WHERE user_id=?`, [
          owner,
        ]);
        removed[table] = Number(result.affectedRows);
      }
      await m.query(
        'UPDATE t_review_notebook_state SET generation=generation+1 WHERE user_id=?',
        [owner],
      );
      return removed;
    });
  }

  async publication(owner: number, id: number) {
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      const [row] = await manager.query(
        'SELECT id,trade_date date,revision,channel,url,body,image_refs imageRefs,created_at createdAt FROM t_review_publication WHERE user_id=? AND id=?',
        [owner, id],
      );
      if (!row) throw new NotFoundException('发布记录不存在');
      const {
        bodies: [body],
      } = await hydrateNotebookAssets(manager, owner, [], [row]);
      const publication = { ...row };
      delete publication.imageRefs;
      return { ...publication, body };
    });
  }

  async recordPublication(owner: number, dto: NotebookPublishDto) {
    let url: URL;
    try {
      url = new URL(dto.url);
    } catch {
      throw new BadRequestException('请输入有效的文章链接');
    }
    const host = dto.channel === 'wechat' ? 'mp.weixin.qq.com' : 'xueqiu.com';
    if (
      url.protocol !== 'https:' ||
      url.hostname !== host ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname === '/'
    )
      throw new BadRequestException('请填写对应平台的 HTTPS 文章链接');
    return this.db.transaction(async (manager) => {
      await manager.query(
        'INSERT INTO t_review_notebook_state(user_id,generation) VALUES(?,0) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',
        [owner],
      );
      const [state] = await manager.query(
        'SELECT generation FROM t_review_notebook_state WHERE user_id=? FOR UPDATE',
        [owner],
      );
      if (Number(state.generation) !== (dto.generation || 0))
        throw new ConflictException('复盘记录已清空，请刷新页面后再登记发布');
      const [row] = await manager.query(
        'SELECT content FROM t_review_notebook_version WHERE user_id=? AND trade_date=? AND revision=?',
        [owner, dto.date, dto.revision],
      );
      if (!row) throw new NotFoundException('请先保存要发布的版本');
      const content = await readNotebookContent(manager, owner, row.content);
      if (
        !content.article?.body.trim() &&
        (!content.public.summary.trim() || !content.public.sources.trim())
      )
        throw new BadRequestException('公开稿须填写核心结论及资料来源与时间');
      const stored = await storeNotebookImages(manager, owner, content);
      const body = publicationText(dto.date, content, dto.channel);
      const imageRefs = JSON.stringify(
        (stored.article?.images || []).map(({ id, data }) => ({ id, data })),
      );
      await manager.query(
        'INSERT INTO t_review_publication(user_id,trade_date,revision,channel,url,body,image_refs) VALUES(?,?,?,?,?,?,?)',
        [owner, dto.date, dto.revision, dto.channel, url.href, body, imageRefs],
      );
      return { recorded: true };
    });
  }
}
