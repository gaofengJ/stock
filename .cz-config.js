module.exports = {
  // 可选类型
  types: [
    { value: 'feat', name: 'feat:     新功能' },
    { value: 'fix', name: 'fix:      修复' },
    { value: 'merge', name: 'merge:     分支合并' },
    { value: 'style', name: 'style:    样式和代码格式' },
    {
      value: 'refactor',
      name: 'refactor: 重构(既不是增加feature,也不是修复bug)'
    },
    { value: 'test', name: 'test:     增加测试' },
    { value: 'chore', name: 'chore:    构建过程或辅助工具的变动' },
    { value: 'revert', name: 'revert:   回退' },
    { value: 'docs', name: 'revert:  文档' }
  ],
  // 消息步骤
  messages: {
    type: '请选择提交类型:',
    // scope: '选择一个更改的范围(scope) (可选):',
    // used if allowCustomScopes is true
    // customScope: 'Denote the SCOPE of this change:',
    subject: '请输入本次commit记录说明(必填):',
    // body: '长说明，使用"|"换行(可选)：\n',
    // breaking: '非兼容性说明 (可选):\n',
    // footer: '关联关闭的issue，例如：#31, #34(可选):\n',
    confirmCommit: '确定提交说明?'
  },

  skipQuestions: ['scope', 'body', 'breaking', 'footer'],

  allowBreakingChanges: [
    'fix',
    'feat',
    'test',
    'refactor',
    'revert',
    'docs',
    'style',
    'chore',
    'merge'
  ],
  subjectLimit: 100
};
