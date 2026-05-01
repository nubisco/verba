# This Homebrew formula is auto-updated by the release workflow.
# To publish it, copy this file into your tap repo at:
#   https://github.com/nubisco/homebrew-tap/blob/main/Formula/verba.rb
#
# Tap usage:
#   brew tap nubisco/tap
#   brew install verba

class Verba < Formula
  desc "CLI for Verba — open-source i18n collaboration platform"
  homepage "https://github.com/nubisco/verba"
  # URL and sha256 are updated automatically by the release GitHub Action
  url "https://registry.npmjs.org/@nubisco/verba-cli/-/verba-cli-0.1.0.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "verba", shell_output("#{bin}/verba --version")
  end
end
