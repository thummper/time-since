import { expect, test } from '@playwright/test'

test('welcome, sign up, timer, reset, undo, demo', async ({ page }) => {
  const email = `smoke-${Date.now()}@example.com`

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Time Since' })).toBeVisible()
  await page.getByRole('link', { name: 'Sign up' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Your timers' })).toBeVisible()
  await page.getByRole('button', { name: 'Add timer' }).first().click()
  await page.getByLabel('Name').fill('Water plants')
  await page.getByRole('dialog').getByRole('button', { name: 'Add timer' }).click()
  await expect(page.getByRole('link', { name: 'Water plants' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Other/ })).toBeVisible()

  await page.getByRole('button', { name: 'Reset Water plants' }).click()
  await expect(page.getByTestId('reset-state')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('reset-state')).toBeHidden()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('button', { name: 'Try demo' })).toBeVisible()

  await page.getByRole('button', { name: 'Try demo' }).click()
  await expect(page.getByRole('heading', { name: 'Your timers' })).toBeVisible()
  await expect(page.getByRole('list').getByRole('listitem').first()).toBeVisible()
})
