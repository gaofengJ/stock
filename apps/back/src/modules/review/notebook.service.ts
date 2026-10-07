import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
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

  async read(owner: number, date: string, revision?: number) {
    const [item] = revision
      ? await this.db.query(
          'SELECT revision,content,created_at updatedAt FROM t_review_notebook_version WHERE user_id=? AND trade_date=? AND revision=?',
          [owner, date, revision],
        )
      : await this.db.query(
          'SELECT revision,content,updated_at updatedAt FROM t_review_notebook WHERE user_id=? AND trade_date=?',
          [owner, date],
        );
    if (revision && !item) throw new NotFoundException('版本不存在');
    const [previous] = await this.db.query(
      'SELECT trade_date date,revision,content FROM t_review_notebook WHERE user_id=? AND trade_date<? ORDER BY trade_date DESC LIMIT 1',
      [owner, date],
    );
    const versions = await this.db.query(
      'SELECT revision,created_at createdAt FROM t_review_notebook_version WHERE user_id=? AND trade_date=? ORDER BY revision DESC LIMIT 100',
      [owner, date],
    );
    const publications = await this.db.query(
      'SELECT id,revision,channel,url,body,created_at createdAt FROM t_review_publication WHERE user_id=? AND trade_date=? ORDER BY id DESC LIMIT 100',
      [owner, date],
    );
    return {
      date,
      revision: Number(item?.revision || 0),
      content: item ? parseNotebook(item.content) : null,
      updatedAt: item?.updatedAt,
      previous: previous
        ? { ...previous, content: parseNotebook(previous.content) }
        : null,
      versions,
      publications,
    };
  }

  async save(owner: number, dto: NotebookSaveDto) {
    const content = JSON.stringify(parseNotebook(dto.content));
    return this.db.transaction(async (m) => {
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
    const [row] = await this.db.query(
      'SELECT content FROM t_review_notebook_version WHERE user_id=? AND trade_date=? AND revision=?',
      [owner, dto.date, dto.revision],
    );
    if (!row) throw new NotFoundException('请先保存要发布的版本');
    const content = parseNotebook(row.content);
    if (!content.public.summary.trim() || !content.public.sources.trim())
      throw new BadRequestException('公开稿须填写核心结论及资料来源与时间');
    const body = publicationText(dto.date, content, dto.channel);
    await this.db.query(
      'INSERT INTO t_review_publication(user_id,trade_date,revision,channel,url,body) VALUES(?,?,?,?,?,?)',
      [owner, dto.date, dto.revision, dto.channel, url.href, body],
    );
    return { recorded: true };
  }
}
