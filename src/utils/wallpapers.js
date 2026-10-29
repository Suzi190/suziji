/**
 * 内置壁纸（纯 CSS 渐变，不占资源、可离线）
 * 风格：低饱和、干净、与磨砂玻璃叠加后仍高级
 */
export const WALLPAPERS = [
  {
    id: 'rose',
    name: '晨雾粉',
    css: 'radial-gradient(100% 60% at 20% 0%, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 62%), radial-gradient(110% 80% at 90% 100%, #FBD3E1 0%, rgba(251,211,225,0) 60%), linear-gradient(170deg, #FFE6EF 0%, #FEDCE7 55%, #FAD0DF 100%)',
  },
  {
    id: 'dawn',
    name: '薄暮',
    css: 'radial-gradient(120% 70% at 20% 5%, #FFEFE8 0%, rgba(255,239,232,0) 55%), radial-gradient(110% 80% at 85% 95%, #EFDCEB 0%, rgba(239,220,235,0) 60%), linear-gradient(160deg, #FBE7EC 0%, #F6DFE7 50%, #EEDCE8 100%)',
  },
  {
    id: 'mist',
    name: '雨后',
    css: 'radial-gradient(120% 70% at 25% 0%, #F5EEF6 0%, rgba(245,238,246,0) 55%), radial-gradient(110% 80% at 80% 100%, #DCE4EE 0%, rgba(220,228,238,0) 62%), linear-gradient(165deg, #F1E8EF 0%, #E9E2EC 50%, #E1E4EE 100%)',
  },
]

export const getWallpaper = (id) => WALLPAPERS.find((item) => item.id === id) ?? WALLPAPERS[0]
