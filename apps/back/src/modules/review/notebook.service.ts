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
  readNotebookContent,
  storeNotebookImages,
} from './notebook-assets';
import { parseNotebook, publicationText } from './notebook.content';
import { NotebookPublishDto, NotebookSaveDto } from './notebook.dto';

@Injectable()
export class NotebookService {
  constructor(private db: DataSource) {}

  async list(owner: number) {
    return this.db.query(
      'SELECT trade_date date,revision,updated_at updatedAt FROM t_review_notebook WHERE user_id=? ORDER BY trade_date DESC LIMIT 120',
      [owner],
    );
  }

  async read(
    owner: number,
    date: string,
    revision?: number,
    publicationBodies = true,
  ) {
    return this.db.transaction('REPEATABLE READ', (manager) =>
      this.readSnapshot(manager, owner, date, revision, publicationBodies),
    );
  }

  private async readSnapshot(
    manager: EntityManager,
    owner: number,
    date: string,
    revision: number | undefined,
    publicationBodies: boolean,
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
    const [previous] = await manager.query(
      'SELECT trade_date date,revision,content FROM t_review_notebook WHERE user_id=? AND trade_date<? ORDER BY trade_date DESC LIMIT 1',
      [owner, date],
    );
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
      [item?.content || '{}', previous?.content || '{}'],
      publicationBodies ? publications : [],
    );
    return {
      date,
      generation: Number(state?.generation || 0),
      revision: Number(item?.revision || 0),
      content: item ? parseNotebook(currentContent) : null,
      updatedAt: item?.updatedAt,
      previous: previous
        ? { ...previous, content: parseNotebook(previousContent) }
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

  async save(owner: number, dto: NotebookSaveDto) {
    const parsed = parseNotebook(dto.content);
    const { research } = parsed;
    if (research && research.date !== dto.date)
      throw new BadRequestException('资料日期与复盘日期不一致');
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
        'SELECT revision FROM t_review_notebook WHERE user_id=? AND trade_date=? FOR UPDATE',
        [owner, dto.date],
      );
      if (Number(row.revision) !== dto.revision)
        throw new ConflictException(
          '其他页面已保存新版本，请先导出本地内容，再重新加载比较',
        );
      const content = JSON.stringify(
        await storeNotebookImages(m, owner, parsed),
      );
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
