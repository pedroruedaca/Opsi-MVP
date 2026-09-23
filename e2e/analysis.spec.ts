import { expect, test, type Page } from '@playwright/test';

const samples = ['modelo-303_2025_1T.pdf', 'modelo-303_2025_2T.pdf', 'modelo-303_2025_3T.pdf', 'modelo-303_2025_4T.pdf', 'cuentas-anuales_2025.pdf'];

async function reviewEverything(page: Page, docs: number) {
  await expect(page.getByRole('tab')).toHaveCount(docs);
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click();
    for (;;) {
      const pending = page.locator('li[data-testid^="field-"]')
        .filter({ has: page.getByTestId('field-outcome').getByText('Pendiente', { exact: true }) }).first();
      if (!(await pending.count())) break;
      const row = page.getByTestId((await pending.getAttribute('data-testid'))!);
      const confirm = row.getByRole('button', { name: 'Confirmar' });
      if (await confirm.count()) await confirm.click(); else await row.getByRole('button', { name: 'Dejar vacío' }).click();
      await expect(row.getByTestId('field-outcome')).not.toHaveText('Pendiente');
    }
  }
}

test('review all samples, run the analysis, follow a source link, reopen', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.fill('input[name=password]', process.env.DEMO_PASSWORD ?? 'demo-password');
  await page.click('button:has-text("Entrar")');
  await expect(page).not.toHaveURL(/login/);

  await page.goto('/');
  await page.click('text=Nuevo caso');
  await page.fill('input[name=borrowerName]', `Análisis E2E ${Date.now()}`);
  await page.fill('input[name=nif]', 'B00000000');
  await page.click('button:has-text("Crear caso")');
  await expect(page.getByText('Arrastra aquí')).toBeVisible();
  const caseUrl = page.url().split('?')[0]!;

  await page.setInputFiles('input[type=file]', samples.map(s => `samples/${s}`));
  for (let i = 0; i < samples.length; i++) await page.locator('li:has(select) button:has-text("Subir")').first().click();
  await expect(page.getByTestId('document-row').filter({ hasText: 'Pendiente de revisión' })).toHaveCount(5, { timeout: 20_000 });

  await page.click('nav >> text=Revisión');
  await reviewEverything(page, samples.length);
  await expect(page.getByText('Revisión completa')).toBeVisible();

  await page.click('nav >> text=Análisis');
  await page.getByRole('button', { name: 'Ejecutar análisis' }).click();
  await expect(page.getByTestId('recommendation')).toContainText('Aprobar (APPROVE)');
  await expect(page.getByTestId('rule-min-vat-turnover').getByTestId('rule-explanation'))
    .toHaveText('Regla 1 superada: facturación declarada en IVA (12 meses) de 1.202.000 € ≥ mínimo de 250.000 €.');
  await expect(page.getByTestId('metric-debt_to_ebitda')).toContainText('2,07x');
  await expect(page.getByText('Las 27 comprobaciones son correctas.')).toBeVisible();

  // Source link from a metric input opens the review at that field, highlighted in the PDF.
  const lev = page.getByTestId('metric-debt_to_ebitda');
  await lev.locator('summary').click();
  await lev.getByRole('link', { name: 'Deudas con entidades de crédito a largo plazo' }).click();
  await expect(page).toHaveURL(/paso=revision&campo=/);
  await expect(page.getByText('El caso está analizado: los campos son de solo lectura.')).toBeVisible();
  await expect(page.getByTestId('pdf-highlight')).toHaveCount(2, { timeout: 15_000 });

  // Reopen, change a value, re-run: new recommendation, old analysis kept in history.
  await page.goto(`${caseUrl}?paso=analisis`);
  await page.getByRole('button', { name: 'Reabrir revisión' }).click();
  await page.getByLabel('Motivo para reabrir la revisión').fill('Comprobar deuda');
  await page.getByRole('button', { name: 'Reabrir revisión' }).click();
  await expect(page.getByText('La revisión se ha reabierto.')).toBeVisible();
  await page.goto(`${caseUrl}?paso=revision`);
  await page.getByRole('tab', { name: /Cuentas anuales/ }).click();
  const debt = page.getByTestId('field-long_term_bank_debt');
  await debt.getByRole('button', { name: 'Cambiar' }).click();
  await debt.getByRole('button', { name: 'Corregir' }).click();
  await debt.getByLabel('Valor correcto').fill('500.000,00');
  await debt.getByLabel('Motivo').fill('Préstamo nuevo');
  await debt.getByRole('button', { name: 'Guardar' }).click();
  await expect(debt.getByTestId('field-outcome')).toHaveText('Corregido');
  await page.goto(`${caseUrl}?paso=analisis`);
  await page.getByRole('button', { name: 'Volver a ejecutar el análisis' }).click();
  await expect(page.getByTestId('recommendation')).toContainText('Denegar (DECLINE)');
  await expect(page.getByTestId('rule-max-leverage').getByTestId('rule-explanation')).toContainText('3,73x está 6,7 % por encima del máximo de 3,50x');
  await expect(page.getByText('sustituido')).toBeVisible();

  await page.goto('/policy');
  await expect(page.getByText('Umbrales ilustrativos de demostración.')).toBeVisible();
  await expect(page.getByRole('cell', { name: '≤ 3,50x' })).toBeVisible();
});
