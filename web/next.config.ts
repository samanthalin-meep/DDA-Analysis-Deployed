import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {'/*': ['./public/runner-source.tar.gz', './lib/runner-version.json', './public/desktop-source.tar.gz', './lib/desktop-version.json']},
};
export default withWorkflow(config);
