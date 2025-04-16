import simpleGit from 'simple-git';
import fsExtra from 'fs-extra';
import cac from 'cac';
import { parsePatch } from 'diff';
import path from 'pathe';
import chalk from 'chalk';
import ora from 'ora';

interface CompareBranchDiffProps {
  baseBranch: string;
  compareBranch: string;
  repoPath: string;
}

const spinner = ora({
  text: `⌛ ${chalk.yellow('Generating...')}`,
  color: 'blue',
});

export async function compareBranchDiff({ baseBranch, compareBranch, repoPath }: CompareBranchDiffProps) {
  // 在原有错误处理逻辑中增加具体检查项
  if (!fsExtra.existsSync(repoPath)) {
    throw new Error(`目标路径不存在: ${repoPath}\n请检查路径是否正确或是否有读取权限`);
  }

  if (!fsExtra.existsSync(path.join(repoPath, '.git'))) {
    throw new Error(`目标路径不是Git仓库: ${repoPath}\n请确认目录包含.git文件夹`);
  }

  const gitRepo = simpleGit(repoPath);
  // 执行git diff前验证分支存在性
  const branchCheck = await gitRepo.branch();
  if (!branchCheck.all.includes(baseBranch)) {
    throw new Error(`源分支不存在: ${baseBranch}\n可用分支: ${branchCheck.all.join(', ')}`);
  }
  if (!branchCheck.all.includes(compareBranch)) {
    throw new Error(`目标分支不存在: ${compareBranch}\n可用分支: ${branchCheck.all.join(', ')}`);
  }

  const outputDir = repoPath.match(/[^/]+(?=\/?$)/)![0];

  try {
    const diff = await gitRepo.diff([baseBranch, compareBranch]);
    const patches = parsePatch(diff);

    if (fsExtra.pathExistsSync(outputDir)) {
      fsExtra.removeSync(outputDir);
    }
    spinner.start();

    for (const patch of patches) {
      if (!patch) continue;

      const filePath = patch.newFileName;

      if (!filePath) {
        continue;
      }

      const outputFile = outputDir + filePath?.replace(/^[^/]+\//, '/');
      await fsExtra.ensureDir(outputFile.substring(0, outputFile.lastIndexOf('/')));

      const hunks = patch.hunks;
      const modifiedLines: string[] = [];

      hunks.forEach((hunk) => {
        hunk.lines.forEach((line) => {
          // Include only added lines
          if (line.startsWith('+') && !line.startsWith('++')) {
            modifiedLines.push(line.substring(1));
          }
        });
      });

      const modifiedContent = modifiedLines.join('\n');

      await fsExtra.writeFile(path.join(process.cwd(), outputFile), modifiedContent, {
        encoding: 'utf-8',
      });
    }
    spinner.stopAndPersist({
      symbol: `✅`,
      text: `${chalk.green(`Successfully`)} ${chalk.white(
        `Please open ${path.join(process.cwd(), outputDir)} confirm!`,
      )}`,
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

const cli = cac('git-diff').version('1.0.0').help();

cli.command('[baseBranch] [compareBranch] [repoPath]').action(async (baseBranch, compareBranch, repoPath) => {
  await compareBranchDiff({
    baseBranch,
    compareBranch,
    repoPath,
  });
});

cli.parse();
