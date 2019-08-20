import API from "claudia-api-builder";
import AWS from "aws-sdk";
import Octokit from "@octokit/rest";

AWS.config.update({ region: "us-east-2" });

const encrypted_token = process.env["GITHUB_TOKEN"];

const decrypt = encrypted =>
  new Promise((resolve, reject) => {
    new AWS.KMS().decrypt(
      { CiphertextBlob: new Buffer(encrypted, "base64") },
      (err, data) => {
        if (err) {
          console.log("Decrypt error:", err);
          return reject(err);
        }

        return resolve(data.Plaintext.toString("ascii"));
      }
    );
  });

const api = new API();

let githubClient;

const parseNextLinkSinceParam = linkHeader => {
  const links = linkHeader.split(",").reduce((acc, link) => {
    const [url, relString] = link.split(";");
    const [_, rel] = relString.match(/rel="(.*)"/);
    return { ...acc, [rel]: url.trim() };
  }, {});

  const nextLink = links["next"];

  if (!nextLink) return null;

  const url = new URL(nextLink.trim().slice(1, nextLink.length - 1));
  const params = new URLSearchParams(url.search);
  const since = params.get("since");

  return parseInt(since, 10);
};

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

  const fullResponse = await githubClient.repos.listPublic(options);
  const { data, headers: { link } = {} } = fullResponse;
  return { data, next: parseNextLinkSinceParam(link), fullResponse };
});

module.exports = api;
