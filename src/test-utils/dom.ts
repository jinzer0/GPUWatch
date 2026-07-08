import { screen } from '@testing-library/react';

export const visibleTableBodyRows = () => screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');

export const visibleTableBodyPids = () =>
  screen.getAllByRole('row').slice(1).map((row) => row.getAttribute('aria-label')?.match(/PID (\d+)/)?.[1]);

export const selectOptionValue = (select: HTMLElement, label: string) => {
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Expected ${label} lookup to receive an HTMLSelectElement.`);
  }

  const option = Array.from(select.options).find((item) => item.textContent === label);
  if (!option) {
    throw new Error(`Missing select option: ${label}`);
  }

  return option.value;
};
