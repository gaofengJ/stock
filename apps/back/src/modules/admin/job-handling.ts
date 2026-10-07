// Read-only annotations: execution outcomes and worker ownership remain unchanged.
// A successor must cover the entire range in the same mode. Partial repairs and
// cancelled tasks cannot hide a failure. Use the latest successor, including a
// failed successor, so only the current task requires attention.
export const jobHandlingSource = `(SELECT related.*,
  CASE
    WHEN status='dismissed' OR (status IN ('failed','interrupted') AND successorStatus='dismissed') THEN 'ignored'
    WHEN status IN ('failed','interrupted') AND successorStatus='success' THEN 'recovered'
    WHEN status IN ('failed','interrupted') AND successorId IS NOT NULL THEN 'continued'
    WHEN status IN ('failed','interrupted') THEN 'needs-attention'
    WHEN status='pending' AND mode='hot'
      AND (error LIKE '等待源端补齐：%' OR error LIKE '日终人气数据待源端补齐%')
      AND error NOT LIKE CONCAT('%',CHAR(10),'%') THEN 'source-wait'
    WHEN status='pending' THEN 'auto-retry'
    ELSE 'normal'
  END handling
  FROM (SELECT j.*,s.id successorId,s.status successorStatus
    FROM t_admin_job j LEFT JOIN t_admin_job s ON s.id=(
      SELECT MAX(n.id) FROM t_admin_job n
      WHERE j.status IN ('failed','interrupted') AND n.id>j.id
        AND n.mode=j.mode AND n.start_date<=j.start_date AND n.end_date>=j.end_date
        AND (n.status IN ('success','failed','interrupted','paused','dismissed')
          OR (n.status IN ('queued','running','pending') AND n.active_key IS NOT NULL))
        AND (n.status<>'success' OR (j.finished_at IS NOT NULL AND n.finished_at>=j.finished_at))
    )
  ) related
) annotated`;
