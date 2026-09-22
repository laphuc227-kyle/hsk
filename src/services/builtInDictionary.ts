export interface BuiltInCharInfo {
  hanzi: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  radical: string;
  strokeCount: number;
  components?: string;
  mnemonic?: string;
  examples: Array<{ sentence: string; pinyin: string; meaning: string }>;
  compoundWords: Array<{ word: string; pinyin: string; meaning: string }>;
}

export const BUILT_IN_DICTIONARY: Record<string, BuiltInCharInfo> = {
  两: {
    hanzi: '两',
    pinyin: 'liǎng',
    hanViet: 'LƯỠNG',
    meaning: 'Hai, đôi (dùng trước lượng từ hoặc chỉ số lượng)',
    radical: '一 (Nhất)',
    strokeCount: 7,
    components: '一 + 冂 + 人 + 人',
    mnemonic: 'Dưới một (一) mái nhà (冂) có hai người (人人) cùng chung sống như một đôi (两).',
    examples: [
      { sentence: '我有两本书。', pinyin: 'Wǒ yǒu liǎng běn shū.', meaning: 'Tôi có hai quyển sách.' },
      { sentence: '现在两点。', pinyin: 'Xiànzài liǎng diǎn.', meaning: 'Bây giờ là hai giờ.' },
      { sentence: '我们两个人是朋友。', pinyin: 'Wǒmen liǎng gè rén shì péngyou.', meaning: 'Hai người chúng tôi là bạn bè.' },
    ],
    compoundWords: [
      { word: '两个', pinyin: 'liǎng gè', meaning: 'Hai cái, hai người' },
      { word: '两点', pinyin: 'liǎng diǎn', meaning: 'Hai giờ' },
      { word: '两天', pinyin: 'liǎng tiān', meaning: 'Hai ngày' },
      { word: '两年', pinyin: 'liǎng nián', meaning: 'Hai năm' },
    ],
  },
  零: {
    hanzi: '零',
    pinyin: 'líng',
    hanViet: 'LINH',
    meaning: 'Số không (0), số lẻ',
    radical: '雨 (Vũ)',
    strokeCount: 13,
    components: '雨 + 令',
    mnemonic: 'Trời mưa (雨) rơi lác đác từng giọt nhỏ lẻ như những con số không (零).',
    examples: [
      { sentence: '今天是二零二六年。', pinyin: 'Jīntiān shì èr líng èr liù nián.', meaning: 'Hôm nay là năm 2026.' },
      { sentence: '我的房间是一零二号。', pinyin: 'Wǒ de fángjiān shì yī líng èr hào.', meaning: 'Phòng của tôi là phòng số 102.' },
    ],
    compoundWords: [
      { word: '零钱', pinyin: 'língqián', meaning: 'Tiền lẻ' },
      { word: '零件', pinyin: 'língjiàn', meaning: 'Linh kiện' },
    ],
  },
  一: {
    hanzi: '一',
    pinyin: 'yī',
    hanViet: 'NHẤT',
    meaning: 'Số một (1), đứng đầu',
    radical: '一 (Nhất)',
    strokeCount: 1,
    components: '一',
    mnemonic: 'Một nét ngang duy nhất đại diện cho số một khởi đầu vạn vật.',
    examples: [
      { sentence: '他是一个好学生。', pinyin: 'Tā shì yí gè hǎo xuésheng.', meaning: 'Cậu ấy là một học sinh giỏi.' },
      { sentence: '请等一下。', pinyin: 'Qǐng děng yíxià.', meaning: 'Xin đợi một chút.' },
    ],
    compoundWords: [
      { word: '一起', pinyin: 'yìqǐ', meaning: 'Cùng nhau' },
      { word: '一天', pinyin: 'yì tiān', meaning: 'Một ngày' },
      { word: '一共', pinyin: 'yígòng', meaning: 'Tổng cộng' },
    ],
  },
  二: {
    hanzi: '二',
    pinyin: 'èr',
    hanViet: 'NHỊ',
    meaning: 'Số hai (2)',
    radical: '二 (Nhị)',
    strokeCount: 2,
    components: '一 + 一',
    mnemonic: 'Hai nét ngang song song tượng trưng cho số 2.',
    examples: [
      { sentence: '二月的天气很冷。', pinyin: 'Èryuè de tiānqì hěn lěng.', meaning: 'Thời tiết tháng hai rất lạnh.' },
      { sentence: '这是第二课。', pinyin: 'Zhè shì dì-èr kè.', meaning: 'Đây là bài học số hai.' },
    ],
    compoundWords: [
      { word: '二月', pinyin: 'èryuè', meaning: 'Tháng hai' },
      { word: '第二', pinyin: 'dì-èr', meaning: 'Thứ hai' },
    ],
  },
  三: {
    hanzi: '三',
    pinyin: 'sān',
    hanViet: 'TAM',
    meaning: 'Số ba (3)',
    radical: '一 (Nhất)',
    strokeCount: 3,
    components: '三 nét ngang',
    mnemonic: 'Ba nét ngang đại diện cho Thiên - Địa - Nhân (Trời, Đất, Con người).',
    examples: [
      { sentence: '我有三个苹果。', pinyin: 'Wǒ yǒu sān gè píngguǒ.', meaning: 'Tôi có ba quả táo.' },
      { sentence: '现在是三月。', pinyin: 'Xiànzài shì sānyuè.', meaning: 'Bây giờ là tháng ba.' },
    ],
    compoundWords: [
      { word: '三月', pinyin: 'sānyuè', meaning: 'Tháng ba' },
      { word: '三个', pinyin: 'sān gè', meaning: 'Ba cái' },
    ],
  },
  四: {
    hanzi: '四',
    pinyin: 'sì',
    hanViet: 'TỨ',
    meaning: 'Số bốn (4)',
    radical: '囗 (Vi)',
    strokeCount: 5,
    components: '囗 + 儿',
    mnemonic: 'Bốn bức tường khép kín bao quanh hai đứa trẻ (儿).',
    examples: [
      { sentence: '一年有四个季节。', pinyin: 'Yì nián yǒu sì gè jìjié.', meaning: 'Một năm có bốn mùa.' },
      { sentence: '我们四点见。', pinyin: 'Wǒmen sì diǎn jiàn.', meaning: 'Chúng ta gặp nhau lúc bốn giờ.' },
    ],
    compoundWords: [
      { word: '四月', pinyin: 'sìyuè', meaning: 'Tháng tư' },
      { word: '四季', pinyin: 'sìjì', meaning: 'Bốn mùa' },
    ],
  },
  五: {
    hanzi: '五',
    pinyin: 'wǔ',
    hanViet: 'NGŨ',
    meaning: 'Số năm (5)',
    radical: '二 (Nhị)',
    strokeCount: 4,
    components: '二 + 乂',
    mnemonic: 'Giao thoa giữa trời và đất tạo nên ngũ hành (5 yếu tố).',
    examples: [
      { sentence: '今天星期五。', pinyin: 'Jīntiān xīngqīwǔ.', meaning: 'Hôm nay là thứ sáu.' },
      { sentence: '我有五本书。', pinyin: 'Wǒ yǒu wǔ běn shū.', meaning: 'Tôi có năm quyển sách.' },
    ],
    compoundWords: [
      { word: '五月', pinyin: 'wǔyuè', meaning: 'Tháng năm' },
      { word: '星期五', pinyin: 'xīngqīwǔ', meaning: 'Thứ sáu' },
    ],
  },
  六: {
    hanzi: '六',
    pinyin: 'liù',
    hanViet: 'LỤC',
    meaning: 'Số sáu (6)',
    radical: '八 (Bát)',
    strokeCount: 4,
    components: '亠 + 八',
    mnemonic: 'Mái nhà che chở cho số 6 vững chãi.',
    examples: [
      { sentence: '六月的天气很热。', pinyin: 'Liùyuè de tiānqì hěn rè.', meaning: 'Thời tiết tháng sáu rất nóng.' },
    ],
    compoundWords: [
      { word: '六月', pinyin: 'liùyuè', meaning: 'Tháng sáu' },
      { word: '星期六', pinyin: 'xīngqīliù', meaning: 'Thứ bảy' },
    ],
  },
  七: {
    hanzi: '七',
    pinyin: 'qī',
    hanViet: 'THẤT',
    meaning: 'Số bảy (7)',
    radical: '一 (Nhất)',
    strokeCount: 2,
    components: '一 + 乚',
    mnemonic: 'Nét móc hướng lên trên tựa như con số 7 đảo ngược.',
    examples: [
      { sentence: '一个星期有七天。', pinyin: 'Yí gè xīngqī yǒu qī tiān.', meaning: 'Một tuần có bảy ngày.' },
    ],
    compoundWords: [
      { word: '七月', pinyin: 'qīyuè', meaning: 'Tháng bảy' },
      { word: '七天', pinyin: 'qī tiān', meaning: 'Bảy ngày' },
    ],
  },
  八: {
    hanzi: '八',
    pinyin: 'bā',
    hanViet: 'BÁT',
    meaning: 'Số tám (8), phát tài',
    radical: '八 (Bát)',
    strokeCount: 2,
    components: '丿 + ㇏',
    mnemonic: 'Hai nét mở rộng sang hai bên như cửa mở đón tài lộc bát ngát.',
    examples: [
      { sentence: '他是八月出生的。', pinyin: 'Tā shì bāyuè chūshēng de.', meaning: 'Cậu ấy sinh vào tháng tám.' },
    ],
    compoundWords: [
      { word: '八月', pinyin: 'bāyuè', meaning: 'Tháng tám' },
      { word: '八点', pinyin: 'bā diǎn', meaning: 'Tám giờ' },
    ],
  },
  九: {
    hanzi: '九',
    pinyin: 'jiǔ',
    hanViet: 'CỬU',
    meaning: 'Số chín (9), trường cửu',
    radical: '乙 (Ất)',
    strokeCount: 2,
    components: '丿 + 乙',
    mnemonic: 'Uốn cong vươn cao tượng trưng cho con số lớn nhất trong dãy số đơn.',
    examples: [
      { sentence: '九月开学了。', pinyin: 'Jiǔyuè kāixué le.', meaning: 'Tháng chín tựu trường rồi.' },
    ],
    compoundWords: [
      { word: '九月', pinyin: 'jiǔyuè', meaning: 'Tháng chín' },
    ],
  },
  十: {
    hanzi: '十',
    pinyin: 'shí',
    hanViet: 'THẬP',
    meaning: 'Số mười (10), hoàn hảo',
    radical: '十 (Thập)',
    strokeCount: 2,
    components: '一 + 丨',
    mnemonic: 'Nét ngang và dọc đan xen tạo thành chữ thập mười phân vẹn mười.',
    examples: [
      { sentence: '我今年十岁。', pinyin: 'Wǒ jīnnián shí suì.', meaning: 'Năm nay tôi mười tuổi.' },
    ],
    compoundWords: [
      { word: '十月', pinyin: 'shíyuè', meaning: 'Tháng mười' },
      { word: '十分', pinyin: 'shífēn', meaning: 'Vô cùng, mười phần' },
    ],
  },
  百: {
    hanzi: '百',
    pinyin: 'bǎi',
    hanViet: 'BÁCH',
    meaning: 'Trăm (100)',
    radical: '白 (Bạch)',
    strokeCount: 6,
    components: '一 + 白',
    mnemonic: 'Thêm nét gạch trên chữ trắng (白) thành trăm (百).',
    examples: [
      { sentence: '这本书一百块。', pinyin: 'Zhè běn shū yìbǎi kuài.', meaning: 'Quyển sách này một trăm tệ.' },
    ],
    compoundWords: [
      { word: '一百', pinyin: 'yìbǎi', meaning: 'Một trăm' },
      { word: '百姓', pinyin: 'bǎixìng', meaning: 'Bách tính' },
    ],
  },
  千: {
    hanzi: '千',
    pinyin: 'qiān',
    hanViet: 'THIÊN',
    meaning: 'Nghìn (1000)',
    radical: '十 (Thập)',
    strokeCount: 3,
    components: '丿 + 十',
    mnemonic: 'Nét phẩy trên chữ thập (十) nhân lên thành nghìn (千).',
    examples: [
      { sentence: '这里有一千个人。', pinyin: 'Zhèlǐ yǒu yìqiān gè rén.', meaning: 'Ở đây có một nghìn người.' },
    ],
    compoundWords: [
      { word: '一千', pinyin: 'yìqiān', meaning: 'Một nghìn' },
    ],
  },
  万: {
    hanzi: '万',
    pinyin: 'wàn',
    hanViet: 'VẠN',
    meaning: 'Vạn, mười nghìn (10.000)',
    radical: '一 (Nhất)',
    strokeCount: 3,
    components: '一 + 勹',
    mnemonic: 'Đơn vị đếm lớn trong tiếng Trung (1 vạn = 10.000).',
    examples: [
      { sentence: '他每个月赚一万块。', pinyin: 'Tā měi gè yuè zhuàn yíwàn kuài.', meaning: 'Mỗi tháng anh ấy kiếm một vạn tệ.' },
    ],
    compoundWords: [
      { word: '一万', pinyin: 'yíwàn', meaning: 'Mười nghìn' },
      { word: '千万', pinyin: 'qiānwàn', meaning: 'Nhất thiết, ngàn vạn' },
    ],
  },
  天: {
    hanzi: '天',
    pinyin: 'tiān',
    hanViet: 'THIÊN',
    meaning: 'Trời, ngày, thời tiết',
    radical: '大 (Đại)',
    strokeCount: 4,
    components: '一 + 大',
    mnemonic: 'Phía trên con người to lớn (大) chính là bầu trời cao rộng (天).',
    examples: [
      { sentence: '今天天气很好。', pinyin: 'Jīntiān tiānqì hěn hǎo.', meaning: 'Hôm nay thời tiết rất đẹp.' },
      { sentence: '明天见！', pinyin: 'Míngtiān jiàn!', meaning: 'Ngày mai gặp lại!' },
    ],
    compoundWords: [
      { word: '今天', pinyin: 'jīntiān', meaning: 'Hôm nay' },
      { word: '明天', pinyin: 'míngtiān', meaning: 'Ngày mai' },
      { word: '天气', pinyin: 'tiānqì', meaning: 'Thời tiết' },
    ],
  },
  日: {
    hanzi: '日',
    pinyin: 'rì',
    hanViet: 'NHẬT',
    meaning: 'Mặt trời, ngày',
    radical: '日 (Nhật)',
    strokeCount: 4,
    components: 'Hình tượng mặt trời',
    mnemonic: 'Hình vẽ mặt trời tròn trịa tỏa sáng trên bầu trời.',
    examples: [
      { sentence: '今天是十月一日。', pinyin: 'Jīntiān shì shíyuè yīrì.', meaning: 'Hôm nay là ngày một tháng mười.' },
    ],
    compoundWords: [
      { word: '生日', pinyin: 'shēngrì', meaning: 'Sinh nhật' },
      { word: '日子', pinyin: 'rìzi', meaning: 'Ngày tháng, cuộc sống' },
    ],
  },
  月: {
    hanzi: '月',
    pinyin: 'yuè',
    hanViet: 'NGUYỆT',
    meaning: 'Mặt trăng, tháng',
    radical: '月 (Nguyệt)',
    strokeCount: 4,
    components: 'Hình tượng vầng trăng khuyết',
    mnemonic: 'Hình vầng trăng khuyết sáng soi trong màn đêm.',
    examples: [
      { sentence: '下个月我去北京。', pinyin: 'Xià gè yuè wǒ qù Běijīng.', meaning: 'Tháng sau tôi đi Bắc Kinh.' },
    ],
    compoundWords: [
      { word: '月亮', pinyin: 'yuèliang', meaning: 'Mặt trăng' },
      { word: '每个月', pinyin: 'měi gè yuè', meaning: 'Mỗi tháng' },
    ],
  },
  年: {
    hanzi: '年',
    pinyin: 'nián',
    hanViet: 'NIÊN',
    meaning: 'Năm, tuổi tác',
    radical: '干 (Can)',
    strokeCount: 6,
    components: 'Hình bó lúa chín một vụ trong năm',
    mnemonic: 'Một mùa lúa chín thu hoạch khép lại một năm (年).',
    examples: [
      { sentence: '祝你新年快乐！', pinyin: 'Zhù nǐ xīnnián kuàilè!', meaning: 'Chúc bạn năm mới vui vẻ!' },
    ],
    compoundWords: [
      { word: '今年', pinyin: 'jīnnián', meaning: 'Năm nay' },
      { word: '新年', pinyin: 'xīnnián', meaning: 'Năm mới' },
      { word: '去年', pinyin: 'qùnián', meaning: 'Năm ngoái' },
    ],
  },
  好: {
    hanzi: '好',
    pinyin: 'hǎo',
    hanViet: 'HẢO',
    meaning: 'Tốt, đẹp, khỏe, được',
    radical: '女 (Nữ)',
    strokeCount: 6,
    components: '女 + 子',
    mnemonic: 'Người mẹ (女) bồng con thơ (子) là điều tốt lành hạnh phúc nhất.',
    examples: [
      { sentence: '你好！很高兴认识你。', pinyin: 'Nǐ hǎo! Hěn gāoxìng rènshi nǐ.', meaning: 'Chào bạn! Rất vui được quen biết bạn.' },
      { sentence: '这个汉语老师很好。', pinyin: 'Zhè gè hànyǔ lǎoshī hěn hǎo.', meaning: 'Thầy giáo tiếng Trung này rất tốt.' },
    ],
    compoundWords: [
      { word: '你好', pinyin: 'nǐhǎo', meaning: 'Xin chào' },
      { word: '好看', pinyin: 'hǎokàn', meaning: 'Đẹp mắt' },
      { word: '好听', pinyin: 'hǎotīng', meaning: 'Hay (nghe)' },
    ],
  },
  大: {
    hanzi: '大',
    pinyin: 'dà',
    hanViet: 'ĐẠI',
    meaning: 'To, lớn',
    radical: '大 (Đại)',
    strokeCount: 3,
    components: 'Hình người giang rộng hai tay hai chân',
    mnemonic: 'Con người dang rộng hai tay hai chân hết cỡ để biểu thị sự to lớn (大).',
    examples: [
      { sentence: '这个苹果很大。', pinyin: 'Zhè gè píngguǒ hěn dà.', meaning: 'Quả táo này rất to.' },
    ],
    compoundWords: [
      { word: '大家', pinyin: 'dàjiā', meaning: 'Mọi người' },
      { word: '大学', pinyin: 'dàxué', meaning: 'Đại học' },
    ],
  },
  小: {
    hanzi: '小',
    pinyin: 'xiǎo',
    hanViet: 'TIỂU',
    meaning: 'Nhỏ, bé',
    radical: '小 (Tiểu)',
    strokeCount: 3,
    components: '亅 + 八',
    mnemonic: 'Một vật thể bị chia nhỏ tách đôi sang hai bên.',
    examples: [
      { sentence: '小猫很可爱。', pinyin: 'Xiǎomāo hěn kě\'ài.', meaning: 'Mèo con rất dễ thương.' },
    ],
    compoundWords: [
      { word: '小时', pinyin: 'xiǎoshí', meaning: 'Tiếng đồng hồ' },
      { word: '小姐', pinyin: 'xiǎojiě', meaning: 'Cô gái, tiểu thư' },
    ],
  },
  多: {
    hanzi: '多',
    pinyin: 'duō',
    hanViet: 'ĐA',
    meaning: 'Nhiều, bao nhiêu',
    radical: '夕 (Tịch)',
    strokeCount: 6,
    components: '夕 + 夕',
    mnemonic: 'Nhiều đêm tối (夕) chồng chất lên nhau biểu thị số lượng nhiều (多).',
    examples: [
      { sentence: '学校里有很多学生。', pinyin: 'Xuéxiào lǐ yǒu hěn duō xuésheng.', meaning: 'Trong trường có rất nhiều học sinh.' },
      { sentence: '这个多少钱？', pinyin: 'Zhè gè duōshao qián?', meaning: 'Cái này bao nhiêu tiền?' },
    ],
    compoundWords: [
      { word: '多少', pinyin: 'duōshao', meaning: 'Bao nhiêu' },
      { word: '多数', pinyin: 'duōshù', meaning: 'Đa số' },
    ],
  },
  少: {
    hanzi: '少',
    pinyin: 'shǎo',
    hanViet: 'THIỂU',
    meaning: 'Ít, thiếu',
    radical: '小 (Tiểu)',
    strokeCount: 4,
    components: '小 + 丿',
    mnemonic: 'Vốn đã nhỏ (小) lại còn bị gạch bớt (丿) nên thành ít (少).',
    examples: [
      { sentence: '这里的书很少。', pinyin: 'Zhèlǐ de shū hěn shǎo.', meaning: 'Sách ở đây rất ít.' },
    ],
    compoundWords: [
      { word: '很少', pinyin: 'hěn shǎo', meaning: 'Rất ít' },
    ],
  },
  看: {
    hanzi: '看',
    pinyin: 'kàn',
    hanViet: 'KHÁN',
    meaning: 'Nhìn, xem, đọc',
    radical: '目 (Mục)',
    strokeCount: 9,
    components: '手 + 目',
    mnemonic: 'Đưa bàn tay (手) lên che trán phía trên mắt (目) để nhìn xa (看).',
    examples: [
      { sentence: '我喜欢看书。', pinyin: 'Wǒ xǐhuān kàn shū.', meaning: 'Tôi thích đọc sách.' },
      { sentence: '明天我们去看电影。', pinyin: 'Míngtiān wǒmen qù kàn diànyǐng.', meaning: 'Ngày mai chúng ta đi xem phim.' },
    ],
    compoundWords: [
      { word: '看见', pinyin: 'kànjiàn', meaning: 'Nhìn thấy' },
      { word: '看书', pinyin: 'kàn shū', meaning: 'Đọc sách' },
    ],
  },
  听: {
    hanzi: '听',
    pinyin: 'tīng',
    hanViet: 'THÍNH',
    meaning: 'Nghe',
    radical: '口 (Khẩu)',
    strokeCount: 7,
    components: '口 + 斤',
    mnemonic: 'Mở miệng (口) lắng nghe từng lời cân nhắc (斤).',
    examples: [
      { sentence: '你听懂了吗？', pinyin: 'Nǐ tīng dǒng le ma?', meaning: 'Bạn nghe hiểu chưa?' },
      { sentence: '我喜欢听音乐。', pinyin: 'Wǒ xǐhuān tīng yīnyuè.', meaning: 'Tôi thích nghe nhạc.' },
    ],
    compoundWords: [
      { word: '听说', pinyin: 'tīngshuō', meaning: 'Nghe nói' },
      { word: '听见', pinyin: 'tīngjiàn', meaning: 'Nghe thấy' },
    ],
  },
  说: {
    hanzi: '说',
    pinyin: 'shuō',
    hanViet: 'THUYẾT',
    meaning: 'Nói',
    radical: '讠(Ngôn)',
    strokeCount: 9,
    components: '讠+ 兑',
    mnemonic: 'Dùng lời nói (讠) để giải bày làm người khác vui lòng (兑).',
    examples: [
      { sentence: '他会说汉语。', pinyin: 'Tā huì shuō hànyǔ.', meaning: 'Anh ấy biết nói tiếng Trung.' },
    ],
    compoundWords: [
      { word: '说话', pinyin: 'shuōhuà', meaning: 'Nói chuyện' },
      { word: '说明', pinyin: 'shuōmíng', meaning: 'Giải thích, thuyết minh' },
    ],
  },
  写: {
    hanzi: '写',
    pinyin: 'xiě',
    hanViet: 'TẢ',
    meaning: 'Viết',
    radical: '冖 (Mịch)',
    strokeCount: 5,
    components: '冖 + 与',
    mnemonic: 'Ngồi dưới mái che (冖) chăm chú viết từng nét chữ.',
    examples: [
      { sentence: '请写下你的名字。', pinyin: 'Qǐng xiě xià nǐ de míngzì.', meaning: 'Xin hãy viết tên của bạn xuống.' },
      { sentence: '他写汉字写得很好。', pinyin: 'Tā xiě hànzì xiě de hěn hǎo.', meaning: 'Anh ấy viết chữ Hán rất đẹp.' },
    ],
    compoundWords: [
      { word: '写作', pinyin: 'xiězuò', meaning: 'Viết văn' },
      { word: '写字', pinyin: 'xiězì', meaning: 'Viết chữ' },
    ],
  },
  买: {
    hanzi: '买',
    pinyin: 'mǎi',
    hanViet: 'MÃI',
    meaning: 'Mua',
    radical: '乙 (Ất)',
    strokeCount: 6,
    components: '乛 + 头',
    mnemonic: 'Đầu (头) nghĩ đến món đồ muốn mua.',
    examples: [
      { sentence: '我想买一个电脑。', pinyin: 'Wǒ xiǎng mǎi yí gè diànnǎo.', meaning: 'Tôi muốn mua một chiếc máy tính.' },
    ],
    compoundWords: [
      { word: '买东西', pinyin: 'mǎi dōngxi', meaning: 'Mua sắm' },
    ],
  },
  卖: {
    hanzi: '卖',
    pinyin: 'mài',
    hanViet: 'MẠI',
    meaning: 'Bán',
    radical: '十 (Thập)',
    strokeCount: 8,
    components: '十 + 买',
    mnemonic: 'Thêm dấu thập (十) trên chữ mua (买) nghĩa là mang hàng đi bán (卖).',
    examples: [
      { sentence: '这个商店卖水果。', pinyin: 'Zhè gè shāngdiàn mài shuǐguǒ.', meaning: 'Cửa hàng này bán hoa quả.' },
    ],
    compoundWords: [
      { word: '买卖', pinyin: 'mǎimai', meaning: 'Buôn bán' },
    ],
  },
  门: {
    hanzi: '门',
    pinyin: 'mén',
    hanViet: 'MÔN',
    meaning: 'Cửa, cổng; môn học, lượng từ cho môn học',
    radical: '门 (Môn)',
    strokeCount: 3,
    components: '门 (Khung cửa mở)',
    mnemonic: 'Hình dáng hai cánh cửa mở ra đón người vào.',
    examples: [
      { sentence: '请关门。', pinyin: 'Qǐng guān mén.', meaning: 'Xin vui lòng đóng cửa.' },
      { sentence: '门口有很多人。', pinyin: 'Ménkǒu yǒu hěn duō rén.', meaning: 'Trước cửa có rất nhiều người.' },
    ],
    compoundWords: [
      { word: '门口', pinyin: 'ménkǒu', meaning: 'Cổng, cửa vào' },
      { word: '开门', pinyin: 'kāi mén', meaning: 'Mở cửa' },
      { word: '关门', pinyin: 'guān mén', meaning: 'Đóng cửa' },
    ],
  },
  本: {
    hanzi: '本',
    pinyin: 'běn',
    hanViet: 'BỔN / BẢN',
    meaning: 'Gốc, rễ, vốn; lượng từ cho sách vở',
    radical: '木 (Mộc)',
    strokeCount: 5,
    components: '木 (Cây) + 一 (Nét ngang chỉ gốc)',
    mnemonic: 'Cây gỗ (木) có một nét vạch ngang chỉ vào gốc rễ bên dưới chính là cội nguồn, gốc bản (本).',
    examples: [
      { sentence: '这是一本书。', pinyin: 'Zhè shì yì běn shū.', meaning: 'Đây là một quyển sách.' },
      { sentence: '那本词典很好。', pinyin: 'Nà běn cídiǎn hěn hǎo.', meaning: 'Quyển từ điển đó rất tốt.' },
    ],
    compoundWords: [
      { word: '本子', pinyin: 'běnzi', meaning: 'Quyển vở, tập vở' },
      { word: '本来', pinyin: 'běnlái', meaning: 'Vốn dĩ, ban đầu' },
    ],
  },
  书: {
    hanzi: '书',
    pinyin: 'shū',
    hanViet: 'THƯ',
    meaning: 'Sách; viết',
    radical: '乛 (Ất)',
    strokeCount: 4,
    components: 'Hình tượng tay cầm bút viết lên thẻ tre',
    mnemonic: 'Cầm bút viết chữ ghi lại tri thức ngàn đời thành quyển sách (书).',
    examples: [
      { sentence: '他在看书。', pinyin: 'Tā zài kàn shū.', meaning: 'Anh ấy đang đọc sách.' },
    ],
    compoundWords: [
      { word: '书店', pinyin: 'shūdiàn', meaning: 'Hiệu sách' },
      { word: '读书', pinyin: 'dú shū', meaning: 'Đọc sách, đi học' },
    ],
  },
};

/**
 * Helper to look up character or compound word from built-in dictionary
 */
export function lookupBuiltIn(hanzi: string): BuiltInCharInfo | null {
  if (BUILT_IN_DICTIONARY[hanzi]) {
    return BUILT_IN_DICTIONARY[hanzi];
  }
  return null;
}
