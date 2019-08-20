import API from "claudia-api-builder";
import AWS from "aws-sdk";
import Octokit from "@octokit/rest";

AWS.config.update({ region: "us-east-2" });

const encrypted_token = process.env["GITHUB_TOKEN"];

const decrypt = encrypted =>
  new Promise((resolve, reject) => {
    const kms = new AWS.KMS();
    kms.decrypt(
      { CiphertextBlob: Buffer.from(encrypted, "base64") },
      (err, data) =>
        err ? reject(err) : resolve(data.Plaintext.toString("ascii"))
    );
  });

const parseNextLinkSinceParam = linkHeader => {
  const links = linkHeader.split(",").reduce((acc, link) => {
    const [url, relString] = link.split(";");
    const [_, rel] = relString.match(/rel="(.*)"/);
    return { ...acc, [rel]: url.trim().slice(1, nextLink.length - 1) };
  }, {});

  const nextLink = links["next"];

  if (!nextLink) return null;

  const url = new URL(nextLink);
  const params = new URLSearchParams(url.search);
  const since = params.get("since");

  return parseInt(since, 10);
};

let githubClient;
const api = new API();
api.get("/repos", async ({ queryString: { since } = {} }) => {
  if (!githubClient) {
    const decrypted_token = await decrypt(encrypted_token);
    githubClient = new Octokit({
      auth: decrypted_token,
      userAgent: "github-lambda-proxy-demo v1.0.0"
    });
  }

  const options = {
    per_page: 100
  };

  if (since) {
    options.since = since;
  }

  const { data, headers: { link } = {} } = await githubClient.repos.listPublic(
    options
  );

  return JSON.stringify({
    data,
    next: parseNextLinkSinceParam(link)
  });
});

module.exports = api;
