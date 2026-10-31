export type WalletListener = (balance: number) => void

export class Wallet {
  private balanceValue = 0
  private readonly listeners = new Set<WalletListener>()

  get balance(): number {
    return this.balanceValue
  }

  canAfford(amount: number): boolean {
    this.validateAmount(amount)
    return this.balanceValue >= amount
  }

  add(amount: number): number {
    this.validateAmount(amount)
    if (!Number.isSafeInteger(this.balanceValue + amount)) throw new RangeError('Wallet balance exceeds the safe integer range')
    this.balanceValue += amount
    this.notify()
    return this.balanceValue
  }

  spend(amount: number): boolean {
    this.validateAmount(amount)
    if (amount > this.balanceValue) return false
    this.balanceValue -= amount
    this.notify()
    return true
  }

  subscribe(listener: WalletListener): () => void {
    this.listeners.add(listener)
    listener(this.balanceValue)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.balanceValue)
  }

  private validateAmount(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('Wallet amounts must be non-negative safe integers')
  }
}