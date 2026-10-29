/**
 * 气泡切分（配合「最终输出指令」的 [s]…[/s] 格式）
 * ------------------------------------------------------------
 * 模型按约定把每个气泡用 [s]...[/s] 包住，这里负责两件事：
 *   1. stripBubbleTags()：流式显示时先把标签剥掉（连末尾半截标签一起吃掉，
 *      否则界面上会闪出「[s」「[/s」这种碎片）
 *   2. splitBubbles()：收完之后按标签切成多条，交给微信存成多条消息、多条气泡
 *
 * 模型没按格式输出时也不丢字：整段当一条气泡照样显示。
 */

/** 末尾可能是半截标签：[s / [/s / [/s]，流式尚未收完时出现 */
function trimPartial(raw) {
  return raw.replace(/\[\/?s?$/, '')
}

/** 流式过程中用：标签换成换行，末尾半截标签丢掉，多余空行压掉 */
export function stripBubbleTags(raw = '') {
  const text = String(raw).replace(/\[\/?s\]/g, '\n')
  return trimPartial(text)
    .replace(/\n{2,}/g, '\n')
    .replace(/^\n+|\n+$/g, '')
}

/**
 * 收完之后用：切成气泡数组
 * @param {string} raw 模型原始输出
 * @param {number} max 最多保留几条（防模型一口气吐几十条把界面刷屏）
 */
export function splitBubbles(raw = '', max = 8) {
  const text = String(raw)
  const parts = []
  const push = (piece) => {
    const clean = String(piece).trim()
    if (clean) parts.push(clean)
  }

  const re = /\[s\]([\s\S]*?)(?:\[\/s\]|$)/g
  let cursor = 0
  let match
  while ((match = re.exec(text)) !== null) {
    // 标签之外的文字（万一模型没守规矩）也收下，别整段丢字
    push(text.slice(cursor, match.index))
    push(match[1])
    cursor = re.lastIndex
    // 空标签 [s][/s] 会零宽匹配，推进一位避免死循环
    if (match[0].length === 0) re.lastIndex += 1
  }
  push(text.slice(cursor))

  return parts.slice(0, max)
}
