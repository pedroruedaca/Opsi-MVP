import { expect, test } from '@playwright/test';

// Uses the synthetic samples, whose extractions are cached, so no API key is needed.
test('upload, cached extraction, hover-to-highlight and field review', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name=password]', process.env.DEMO_PASSWORD ?? 'demo-password');
  await page.click('button:has-text("Entrar")');
  await expect(page).not.toHaveURL(/login/);

  await page.goto('/');
  await page.click('text=Nuevo caso');
  await page.fill('input[name=borrowerName]', `E2E ${Date.now()}`);
  await page.fill('input[name=nif]', 'B00000000');
  await page.click('button:has-text("Crear caso")');
  await expect(page.getByText('Arrastra aquí')).toBeVisible();

  await page.setInputFiles('input[type=file]', ['samples/modelo-303_2025_2T.pdf', 'samples/cuentas-anuales_2025.pdf']);
  for (let i = 0; i < 2; i++) await page.locator('li:has(select) button:has-text("Subir")').first().click();
  await expect(page.getByTestId('document-row')).toHaveCount(2);
  await expect(page.getByTestId('document-row').filter({ hasText: 'Pendiente de revisión' })).toHaveCount(2, { timeout: 15_000 });

  await page.click('nav >> text=Revisión');
  await expect(page.locator('[data-page="1"] canvas')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('field-base_21').hover();
  await expect(page.getByTestId('pdf-highlight')).toHaveCount(2);
  await expect(page.getByText('Origen resaltado en la p. 1.')).toBeVisible();

  await page.getByTestId('field-base_21').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByTestId('field-base_21').getByTestId('field-outcome')).toHaveText('Confirmado');

  const cuota = page.getByTestId('field-cuota_21');
  await cuota.getByRole('button', { name: 'Corregir' }).click();
  await cuota.getByLabel('Valor correcto').fill('65.100,50');
  await cuota.getByLabel('Motivo').fill('Céntimos mal leídos');
  await cuota.getByRole('button', { name: 'Guardar' }).click();
  await expect(cuota.getByTestId('field-outcome')).toHaveText('Corregido');
  await expect(cuota).toContainText('65.100,50 €');

  await page.getByRole('tab', { name: /Cuentas anuales/ }).click();
  await expect(page.locator('[data-page="2"] canvas')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('field-revenue').hover();
  await expect(page.getByText('Origen resaltado en la p. 2.')).toBeVisible();
  await expect(page.locator('[data-page="2"] [data-testid=pdf-highlight]')).toHaveCount(2);

  const ebitda = page.getByTestId('field-ebitda');
  await ebitda.hover();
  await expect(page.getByText('Sin cita: el valor no se encontró en el documento.')).toBeVisible();
  await ebitda.getByRole('button', { name: 'Dejar vacío' }).click();
  await expect(ebitda.getByTestId('field-outcome')).toHaveText('Vacío');
});
