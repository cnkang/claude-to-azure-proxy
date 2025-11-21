# Git History Cleanup Guide

## 问题分析

### 发现的问题

1. **test-results/.last-run.json** - 测试运行记录文件被错误提交
2. **playwright-report/** - Playwright 测试报告文件被错误提交（约 513KB）

### 根本原因

这些文件在 `.gitignore` 配置之前就被提交到了 git 历史中。虽然现在 `.gitignore` 已正确配置：

```gitignore
playwright-report/*
test-results/*
```

但已经在历史记录中的文件不会被自动移除。

## 已完成的操作

✅ 从当前 git 追踪中移除了 `test-results/.last-run.json` ✅ 验证了 `.gitignore`
配置正确 ✅ 创建了分析和清理脚本

## 清理历史记录

### 方案 1: 完整清理（推荐）

使用 `git-filter-repo` 从所有历史记录中移除这些文件：

```bash
# 运行安全清理脚本
bash scripts/cleanup-git-history-safe.sh
```

这个脚本会：

- 创建备份分支
- 从所有历史记录中移除 test-results/ 和 playwright-report/
- 减小仓库大小（约 1MB）
- 提供详细的操作说明

### 方案 2: 仅清理当前分支

如果只想从当前提交开始清理：

```bash
# 提交当前更改
git add test-results/.last-run.json
git commit -m "chore: remove test artifacts from git tracking"
```

## 清理后的操作

### 如果执行了完整清理（方案 1）

1. **验证清理结果**

   ```bash
   git log --oneline | head -20
   git ls-files | grep -E '(test-results|playwright-report)'
   ```

2. **强制推送到远程**

   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

3. **通知团队成员** 所有团队成员需要重新克隆仓库或执行：
   ```bash
   git fetch origin
   git reset --hard origin/main  # 或对应的分支名
   ```

### 如果只执行了当前清理（方案 2）

正常推送即可：

```bash
git push origin main
```

## 预防措施

### 1. 验证 .gitignore 生效

```bash
# 测试文件是否被正确忽略
git check-ignore -v test-results/.last-run.json
git check-ignore -v playwright-report/index.html
```

### 2. 定期检查

```bash
# 检查是否有不该被追踪的文件
bash scripts/analyze-git-unwanted-files.sh
```

### 3. Pre-commit Hook（可选）

可以添加 pre-commit hook 防止意外提交：

```bash
# .husky/pre-commit
#!/bin/bash

# 检查是否有测试产物被提交
if git diff --cached --name-only | grep -E '(test-results|playwright-report)'; then
  echo "❌ Error: Test artifacts should not be committed"
  echo "Files found:"
  git diff --cached --name-only | grep -E '(test-results|playwright-report)'
  exit 1
fi
```

## 工具说明

### analyze-git-unwanted-files.sh

分析 git 历史中的不需要的文件，显示：

- 当前被追踪的不该追踪的文件
- 历史提交记录
- 仓库大小分析
- 最大的文件列表

### cleanup-git-history-safe.sh

安全地清理 git 历史：

- 自动创建备份分支
- 交互式确认
- 显示清理前后的大小对比
- 提供详细的后续步骤说明

## 参考资料

- [git-filter-repo 文档](https://github.com/newren/git-filter-repo)
- [Git 历史重写最佳实践](https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History)
