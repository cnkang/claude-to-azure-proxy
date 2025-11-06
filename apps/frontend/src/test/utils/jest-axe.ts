import axeCore, { type AxeResults, type NodeResult } from 'axe-core';

type AxeContainer = Element | Document;

const formatNode = (node: NodeResult): string => {
  const target = node.target.join(', ');
  const failureSummary =
    node.failureSummary?.trim() ?? 'No failure summary provided';
  return `  - Target: ${target}\n    ${failureSummary}`;
};

const formatViolation = (
  violation: AxeResults['violations'][number]
): string => {
  const nodes = violation.nodes.map(formatNode).join('\n');
  return `${violation.id} (${violation.impact ?? 'no impact reported'}): ${violation.help}\n${nodes}`;
};

const normalizeContainer = (container: AxeContainer): Element => {
  if (container instanceof Element) {
    return container;
  }
  return container.documentElement;
};

export async function axe(
  container: AxeContainer,
  options: axeCore.RunOptions = {}
): Promise<AxeResults> {
  const _element = normalizeContainer(container);
  return axeCore.run(_element, options);
}

const toHaveNoViolationsMatcher = function (
  this: { utils?: { RED_BG?: string } },
  results?: AxeResults
) {
  if (!results) {
    return {
      pass: false,
      message: () => 'Expected axe results but received null or undefined.',
    };
  }

  const { violations } = results;
  if (violations.length === 0) {
    return {
      pass: true,
      message: () => 'Expected accessibility violations but none were found.',
    };
  }

  const details = violations.map(formatViolation).join('\n\n');
  return {
    pass: false,
    message: () =>
      ['Expected no accessibility violations but found:', '', details].join(
        '\n'
      ),
  };
};

export const toHaveNoViolations = {
  toHaveNoViolations: toHaveNoViolationsMatcher,
};
