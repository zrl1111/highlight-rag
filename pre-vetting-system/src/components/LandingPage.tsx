/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import '../landing.css';

const HERO_IMAGE = '/landing/hero.webp';
const EDITORIAL_IMAGE = '/landing/editorial.webp';

type LandingPageProps = {
  onEnterDemo: () => void;
};

function MaterialIcon({
  name,
  filled,
  className = '',
}: {
  name: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{fontVariationSettings: filled ? '"FILL" 1' : '"FILL" 0'}}
      aria-hidden
    >
      {name}
    </span>
  );
}

export function LandingPage({ onEnterDemo }: LandingPageProps) {
  return (
    <div className="landing-root bg-lp-background text-lp-on-surface font-lp-body antialiased min-h-screen flex flex-col selection:bg-lp-brand-container selection:text-lp-on-brand-container">
      <nav className="bg-lp-surface-bright/80 backdrop-blur-xl w-full sticky top-0 z-50 shadow-sm border-b border-lp-surface-container-low/80">
        <div className="flex justify-between items-center max-w-7xl mx-auto px-6 py-4">
          <a
            className="text-2xl font-lp-display font-bold tracking-tight text-lp-on-surface"
            href="#"
            onClick={(e) => e.preventDefault()}
          >
            &nbsp;
          </a>
          <button type="button" className="md:hidden text-lp-on-surface" aria-label="Menu">
            <MaterialIcon name="menu" className="text-3xl" />
          </button>
        </div>
      </nav>

      <main className="grow flex flex-col">
        <section className="relative pt-24 pb-32 px-6 lg:px-8 overflow-hidden">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(51,102,204,0.05),transparent_50%)]" />
          <div className="max-w-7xl mx-auto relative z-10 grid lg:grid-cols-2 gap-16 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-lp-surface-container-low text-lp-tertiary font-lp-label text-xs font-semibold mb-8 tracking-wider uppercase ghost-border">
                <MaterialIcon name="verified" filled className="text-sm" />
                Pre-vetting System
              </div>
              <h1 className="font-lp-headline text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-lp-on-surface leading-[1.1] mb-8">
                Instant clarity.
                <br />
                <span className="text-lp-brand">See beyond the page.</span>
              </h1>
              <p className="text-lg sm:text-xl text-lp-on-surface-variant leading-relaxed mb-10 max-w-xl font-lp-body">
                Transform unstructured application documents into clean data with comprehensive risk
                checks with AI power to accelerate approvals and stop fraud.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={onEnterDemo}
                  className="inline-flex items-center justify-center px-8 py-4 bg-linear-to-r from-lp-brand to-lp-brand-container text-lp-on-brand font-lp-label font-semibold text-base rounded hover:shadow-xl hover:shadow-lp-brand/20 transition-all duration-300"
                >
                  Demo
                </button>
              </div>
            </div>

            <div className="relative aspect-4/3 lg:aspect-square flex items-center justify-center w-2/3 mx-auto">
              <div className="absolute inset-0 bg-linear-to-tr from-lp-surface-container-lowest to-lp-surface-container-low rounded-xl transform rotate-3 shadow-sm ghost-border" />
              <div className="absolute inset-0 bg-lp-surface-bright rounded-xl transform -rotate-2 shadow-sm ghost-border flex items-center justify-center overflow-hidden">
                <img
                  alt="Data extraction visualization"
                  className="w-full h-full object-cover opacity-90"
                  src={HERO_IMAGE}
                />
              </div>
              <div className="absolute top-1/4 -left-8 glass-panel ghost-border rounded-lg p-4 shadow-lg flex items-center gap-4 animate-[bounce_6s_ease-in-out_infinite]">
                <div className="w-10 h-10 rounded bg-lp-brand-fixed flex items-center justify-center text-lp-brand">
                  <MaterialIcon name="document_scanner" filled />
                </div>
                <div>
                  <p className="font-lp-label text-xs text-lp-on-surface-variant uppercase tracking-wider">
                    Status
                  </p>
                  <p className="font-lp-headline text-sm font-semibold text-lp-on-surface">
                    Data Extracted
                  </p>
                </div>
              </div>
              <div className="absolute bottom-1/4 -right-8 glass-panel ghost-border rounded-lg p-4 shadow-lg flex items-center gap-4 animate-[bounce_8s_ease-in-out_infinite_reverse]">
                <div className="w-10 h-10 rounded bg-lp-tertiary-fixed flex items-center justify-center text-lp-on-tertiary-fixed">
                  <MaterialIcon name="gpp_good" filled />
                </div>
                <div>
                  <p className="font-lp-label text-xs text-lp-on-surface-variant uppercase tracking-wider">
                    Risk Level
                  </p>
                  <p className="font-lp-headline text-sm font-semibold text-lp-on-surface">
                    Verified Clean
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 border-y border-lp-surface-container-low bg-lp-surface-container-lowest">
          <div className="max-w-7xl mx-auto px-6" />
        </section>

        <section className="py-24 px-6 lg:px-8 bg-lp-surface-dim relative">
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="font-lp-headline text-4xl lg:text-5xl font-bold text-lp-on-surface mb-6 tracking-tight">
                The anatomy of certainty.
              </h2>
              <p className="font-lp-body text-lg text-lp-on-surface-variant">
                We support review with deterministic AI, ensuring every application is parsed,
                cross-referenced, and cleared before a human ever looks at it.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-lp-surface-bright rounded-xl p-8 ghost-border shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
                <div className="w-14 h-14 rounded-lg bg-lp-brand-fixed flex items-center justify-center text-lp-brand mb-6">
                  <MaterialIcon name="troubleshoot" filled className="text-3xl" />
                </div>
                <h3 className="font-lp-headline text-2xl font-bold text-lp-on-surface mb-4">
                  AI-Powered Extraction
                </h3>
                <p className="font-lp-body text-lp-on-surface-variant leading-relaxed grow">
                  Convert dense, unstructured PDFs, scans, and forms into pristine, structured JSON
                  data instantly. Our models understand context, not just text coordinates.
                </p>
              </div>
              <div className="bg-lp-surface-bright rounded-xl p-8 ghost-border shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col md:-translate-y-4">
                <div className="w-14 h-14 rounded-lg bg-lp-tertiary-fixed flex items-center justify-center text-lp-on-tertiary-fixed mb-6">
                  <MaterialIcon name="rule" filled className="text-3xl" />
                </div>
                <h3 className="font-lp-headline text-2xl font-bold text-lp-on-surface mb-4">
                  Comprehensive Risk Checks
                </h3>
                <p className="font-lp-body text-lp-on-surface-variant leading-relaxed grow">
                  Automatically cross-reference extracted data against external databases to detect
                  inconsistencies, forged documents, and compliance flags in real-time.
                </p>
              </div>
              <div className="bg-lp-surface-bright rounded-xl p-8 ghost-border shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col">
                <div className="w-14 h-14 rounded-lg bg-lp-secondary-fixed flex items-center justify-center text-lp-on-secondary-fixed mb-6">
                  <MaterialIcon name="speed" filled className="text-3xl" />
                </div>
                <h3 className="font-lp-headline text-2xl font-bold text-lp-on-surface mb-4">
                  Accelerated Approvals
                </h3>
                <p className="font-lp-body text-lp-on-surface-variant leading-relaxed grow">
                  Eliminate bottlenecks in government and insurance workflows. Route clean
                  applications to auto-approval and flag only the complex cases for manual review.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-32 px-6 lg:px-8 bg-lp-surface-bright">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div className="order-2 lg:order-1 relative">
                <div className="aspect-3/4 bg-lp-surface-container-high rounded-xl overflow-hidden ghost-border relative">
                  <img
                    alt="Scholarly document review"
                    className="w-full h-full object-cover opacity-90"
                    src={EDITORIAL_IMAGE}
                  />
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-linear-to-t from-lp-surface-dim to-transparent">
                    <p className="font-lp-label text-sm text-lp-on-surface font-semibold tracking-wide">
                      THE INTELLIGENCE LAYER
                    </p>
                  </div>
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <h2 className="font-lp-headline text-4xl lg:text-5xl font-bold text-lp-on-surface mb-8 tracking-tight">
                  Bridging the gap between raw ink and decisive action.
                </h2>
                <div className="space-y-8">
                  <div>
                    <p className="font-lp-body text-lg text-lp-on-surface-variant leading-relaxed">
                      The modern administrative burden is defined by opacity. Thousands of
                      applications, each a labyrinth of unstructured narrative, handwritten notes,
                      and standardized forms. Our system acts as the ultimate scholarly
                      curator—reading, synthesizing, and validating every page with unwavering
                      precision.
                    </p>
                  </div>
                  <div className="pl-6 border-l-2 border-lp-brand-container">
                    <h4 className="font-lp-headline text-xl font-bold text-lp-on-surface mb-2">
                      Beyond OCR
                    </h4>
                    <p className="font-lp-body text-lp-on-surface-variant">
                      We don&apos;t just read characters; we comprehend intent. Our intelligence layer
                      maps extracted entities to complex ontological models, ensuring that a
                      &quot;diagnosis&quot; is understood functionally, not just textually.
                    </p>
                  </div>
                  <div className="pl-6 border-l-2 border-lp-tertiary">
                    <h4 className="font-lp-headline text-xl font-bold text-lp-on-surface mb-2">
                      The Audit Trail
                    </h4>
                    <p className="font-lp-body text-lp-on-surface-variant">
                      Every automated decision is accompanied by a transparent lineage back to the
                      original document, preserving the evidentiary standard required by top-tier
                      institutions.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-lp-surface-container-high w-full py-12 px-6">
        <div className="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto gap-6">
          <div className="text-center md:text-left">
            <p className="font-lp-display font-bold text-lp-on-surface mb-2 text-xl tracking-tight">
              HKUST
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
