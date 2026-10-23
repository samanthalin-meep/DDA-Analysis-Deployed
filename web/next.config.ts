import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {'/*': ['./public/runner-source.tar.gz', './lib/runner-version.json']},
};
export default withWorkflow(config);
