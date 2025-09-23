const core = require('@actions/core');
const fs = require('fs');

//-------------------------//

function shortSha(sha) {
  if (!sha) return 'unknown';
  return sha.substring(0, 7);
}

//- - - - - - - - - - - - -//

function utcTimestamp() {
  const d = new Date();
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  return d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "_" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds());
}

//-------------------------//

try {
  const imageName = core.getInput('image_name', { required: true });
  core.info(`Calculating tags for image: ${imageName}`);

  const githubSha = process.env.GITHUB_SHA || '';
  const short = shortSha(githubSha);
  const ts = utcTimestamp();
  const tags = [];

  tags.push(`${imageName}:latest`);
  core.info('Added tag: latest');

  if (short) {
    tags.push(`${imageName}:${short}`);
    core.info(`Added tag: ${short}`);
  }
  tags.push(`${imageName}:${ts}`);
  core.info(`Added tag: ${ts}`);

  const releaseTag = process.env.RELEASE_TAG || process.env.ACTIONS_RELEASE_TAG || '';
  if (releaseTag) {
    tags.push(`${imageName}:${releaseTag}`);
    core.info(`Added tag from environment: ${releaseTag}`);
  }

  const tagsStr = tags.join('\n');

  // Set as action outputs
  core.setOutput('tags', '[' + tags.map(t => '"' + t + '"').join(',') + ']');
  core.setOutput('tags_newline_separated', tagsStr);
  const tagsDataJson = '{"latest":"' + 'latest' + '","timestamp":"' + ts + '","shortSha":"' + short + '"}';
  core.setOutput('tags_data', tagsDataJson);
  core.info(`Tags outputs set successfully. (#: ${tags.length})`);

  // Also write to .image-tags for workflows that prefer reading a file
  const workspace = process.env.GITHUB_WORKSPACE;
  if (workspace) {
    try {
      const outPath = `${workspace}/.image-tags`;
      fs.writeFileSync(outPath, tagsStr + '\n', { encoding: 'utf8' });
      core.info(`Tags also written to file: ${outPath}`);
    } catch (fileError) {
      core.warning(`Could not write to .image-tags file: ${fileError.message}`);
    }
  }

} catch (error) {
  core.setFailed(error.message);
}