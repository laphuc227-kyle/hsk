import { GrammarTopic } from '../types';

export const INITIAL_GRAMMAR_TOPICS: GrammarTopic[] = [
  {
    id: 'g_shide',
    level: 'HSK1',
    title: 'Cấu trúc nhấn mạnh "是...的" (Shì... de)',
    pattern: 'Chủ ngữ + 是 + [Thời gian / Địa điểm / Phương thức] + Động từ + 的',
    explanation:
      'Dùng để nhấn mạnh thời gian, địa điểm, mục đích hoặc phương thức của một hành động ĐÃ XẢY RA trong quá khứ. Người nói và người nghe đều biết hành động đã diễn ra, chỉ muốn làm rõ thông tin chi tiết.',
    usageNotes: [
      'Trong câu khẳng định, chữ "是" có thể lược bỏ, nhưng chữ "的" ở cuối câu bắt buộc phải có.',
      'Trong câu phủ định, bắt buộc dùng "不是...的" và không được lược bỏ "不是".',
    ],
    examples: [
      {
        sentence: '我是昨天来的。',
        pinyin: 'Wǒ shì zuótiān lái de.',
        meaning: 'Tôi đến vào ngày hôm qua (nhấn mạnh thời gian "ngày hôm qua").',
        highlight: '是 昨天 来的',
      },
      {
        sentence: '我们是在北京认识的。',
        pinyin: 'Wǒmen shì zài Běijīng rènshi de.',
        meaning: 'Chúng tôi quen nhau ở Bắc Kinh (nhấn mạnh địa điểm "ở Bắc Kinh").',
        highlight: '是 在北京 认识的',
      },
      {
        sentence: '他是坐飞机去上海 generalize的。',
        pinyin: 'Tā shì zuò fēijī qù Shànghǎi de.',
        meaning: 'Anh ấy đi Thượng Hải bằng máy bay (nhấn mạnh phương thức "bằng máy bay").',
        highlight: '是 坐飞机 的',
      },
      {
        sentence: '我不是一个人来的。',
        pinyin: 'Wǒ bú shì yīgè rén lái de.',
        meaning: 'Tôi không phải đến một mình (câu phủ định).',
        highlight: '不是 一个人 来的',
      },
    ],
    practiceQuestions: [
      {
        id: 'q_shide_1',
        type: 'choice',
        prompt: 'Chọn câu nhấn mạnh phương thức đi lại đúng trong tiếng Trung:',
        options: [
          '我是坐出租车来的。',
          '我是来的坐出租车。',
          '我坐出租车是来的。',
          '我是坐出租车来。',
        ],
        correctAnswer: '我是坐出租车来的。',
        explanation: 'Cấu trúc "是...的" kẹp bộ phận nhấn mạnh (坐出租车) ở giữa "是" và "động từ + 的".',
      },
      {
        id: 'q_shide_2',
        type: 'reorder',
        prompt: 'Sắp xếp các từ sau thành câu đúng:',
        scrambledTokens: ['是在', '认识的', '我们', '学校'],
        correctAnswer: '表我们是在学校认识的。',
        explanation: 'Thứ tự đúng: Chủ ngữ (我们) + 是在 + Địa điểm (学校) + Động từ + 的 (认识的).',
      },
    ],
  },
  {
    id: 'g_bi',
    level: 'HSK2',
    title: 'Cấu trúc so sánh hơn với "比" (Bǐ)',
    pattern: 'Đối tượng A + 比 + Đối tượng B + Tính từ (+ Số lượng / 得多 / 多了)',
    explanation:
      'Dùng để so sánh tính chất hoặc mức độ giữa 2 sự vật, con người. Muốn thể hiện mức độ chênh lệch lớn thì thêm "得多" (dé duō) hoặc "多了" (duō le) ở cuối câu.',
    usageNotes: [
      'Không dùng các từ chỉ mức độ như "很" (hần), "非常" (phây tráng) trực tiếp trước tính từ trong câu chứa "比". Ví dụ KHÔNG nói: A 比 B 很好 (Sai!).',
      'Nếu muốn phủ định, dùng "A 没有 B + Tính từ" (A không bằng B).',
    ],
    examples: [
      {
        sentence: '今天比昨天冷。',
        pinyin: 'Jīntiān bǐ zuótiān lěng.',
        meaning: 'Hôm nay lạnh hơn hôm qua.',
        highlight: '比 昨天 冷',
      },
      {
        sentence: '哥哥比我高很多。',
        pinyin: 'Gēge bǐ wǒ gāo hěn duō.',
        meaning: 'Anh trai cao hơn tôi rất nhiều.',
        highlight: '比 我 高很多',
      },
      {
        sentence: '苹果比西瓜便宜得多。',
        pinyin: 'Píngguǒ bǐ xīguā piányi de duō.',
        meaning: 'Táo rẻ hơn dưa hấu nhiều lắm.',
        highlight: '比 西瓜 便宜得多',
      },
    ],
    practiceQuestions: [
      {
        id: 'q_bi_1',
        type: 'choice',
        prompt: 'Câu nào sau đây viết ĐÚNG ngữ pháp so sánh "比"?',
        options: [
          '小张比小李很高。',
          '小张比小李高。',
          '小张很比小李高。',
          '小张比高小李。',
        ],
        correctAnswer: '小张比小李高。',
        explanation: 'Trong câu so sánh "比", tuyệt đối không dùng phó từ chỉ mức độ "很" trước tính từ.',
      },
    ],
  },
  {
    id: 'g_ba',
    level: 'HSK3',
    title: 'Cấu trúc xử lý đối tượng "把" (Bǎ)',
    pattern: 'Chủ ngữ + 把 + Tân ngữ + Động từ + Thành phần kết quả (在/到/给/好/完...)',
    explanation:
      'Câu chữ "把" nhấn mạnh sự tác động của chủ ngữ làm thay đổi vị trí, hình thái, thái độ hoặc trạng thái sở hữu của tân ngữ.',
    usageNotes: [
      'Tân ngữ sau "把" phải là đối tượng xác định (người nghe và nói đều biết).',
      'Động từ trong câu chữ "把" không bao giờ đứng đơn độc một mình, luôn phải kèm thành phần bổ ngữ hoặc trợ từ (ví dụ: 关上, 吃了, 放在桌子上).',
    ],
    examples: [
      {
        sentence: '请把门关上。',
        pinyin: 'Qǐng bǎ mén guān shàng.',
        meaning: 'Xin hãy đóng cửa lại (tác động làm cửa đóng lại).',
        highlight: '把 门 关上',
      },
      {
        sentence: '弟弟把苹果吃了。',
        pinyin: 'Dìdi bǎ píngguǒ chī le.',
        meaning: 'Em trai đã ăn mất quả táo rồi.',
        highlight: '把 苹果 吃了',
      },
      {
        sentence: '请把书放在桌子上。',
        pinyin: 'Qǐng bǎ shū fàng zài zhuōzi shàng.',
        meaning: 'Xin hãy đặt sách lên trên bàn.',
        highlight: '把 书 放在桌子上',
      },
    ],
    practiceQuestions: [
      {
        id: 'q_ba_1',
        type: 'choice',
        prompt: 'Trong câu chữ "把", động từ bắt buộc phải có điều kiện gì?',
        options: [
          'Phải đứng đầu câu',
          'Phải có thành phần kết quả / bổ ngữ đi kèm (không đứng một mình)',
          'Phải đi kèm từ "很"',
          'Không được có tân ngữ',
        ],
        correctAnswer: 'Phải có thành phần kết quả / bổ ngữ đi kèm (không đứng một mình)',
        explanation: 'Động từ trong câu chữ 把 tác động lên tân ngữ làm phát sinh kết quả, nên luôn cần bổ ngữ như 完, 好, 在, 到, 上, 下...',
      },
    ],
  },
  {
    id: 'g_guo',
    level: 'HSK2',
    title: 'Trợ từ trải nghiệm "过" (Guò)',
    pattern: 'Chủ ngữ + Động từ + 过 + Tân ngữ',
    explanation:
      'Dùng để biểu thị kinh nghiệm hoặc trải nghiệm đã từng làm một việc gì đó trong quá khứ và hiện tại không còn diễn ra nữa.',
    usageNotes: [
      'Phủ định của "过" dùng "没 (有)...过".',
      'Khác với "了" (nhấn mạnh hành động vừa hoàn thành), "过" nhấn mạnh việc đó đã trở thành một ký ức/trải nghiệm.',
    ],
    examples: [
      {
        sentence: '我去过中国。',
        pinyin: 'Wǒ qù guò Zhōngguó.',
        meaning: 'Tôi từng đi Trung Quốc.',
        highlight: '去过 中国',
      },
      {
        sentence: '你吃过北京烤鸭吗？',
        pinyin: 'Nǐ chī guò Běijīng kǎoyā ma?',
        meaning: 'Bạn từng ăn vịt quay Bắc Kinh chưa?',
        highlight: '吃过 北京烤鸭',
      },
      {
        sentence: '我没看 过这部电影。',
        pinyin: 'Wǒ méi kàn guò zhè bù diànyǐng.',
        meaning: 'Tôi chưa từng xem bộ phim này.',
        highlight: '没看 过',
      },
    ],
    practiceQuestions: [
      {
        id: 'q_guo_1',
        type: 'choice',
        prompt: 'Phủ định của câu "我去过北京" là câu nào?',
        options: [
          '我不去过北京。',
          '我没去过北京。',
          '我不去北京过。',
          '我没去北京了。',
        ],
        correctAnswer: '我没去过北京。',
        explanation: 'Phủ định của trải nghiệm trong quá khứ với "过" luôn dùng "没 (有) + Động từ + 过".',
      },
    ],
  },
  {
    id: 'g_zhengzai',
    level: 'HSK1',
    title: 'Hành động đang diễn ra "正在...呢" (Zhèngzài... ne)',
    pattern: 'Chủ ngữ + (正在 / 在 / 正) + Động từ + (Tân ngữ) + (呢)',
    explanation:
      'Diễn tả một hành động đang trong quá trình diễn ra tại thời điểm nói hoặc thời điểm được nhắc tới (tương đương với thì hiện tại tiếp diễn V-ing trong tiếng Anh).',
    usageNotes: [
      'Có thể dùng trọn bộ "正在...呢", hoặc rút gọn thành "在...", "正...", hoặc chỉ thêm ngữ khí từ "呢" ở cuối câu.',
    ],
    examples: [
      {
        sentence: '他正在开会呢。',
        pinyin: 'Tā zhèngzài kāihuì ne.',
        meaning: 'Anh ấy đang họp đấy.',
        highlight: '正在 开会 呢',
      },
      {
        sentence: '妈妈在做饭。',
        pinyin: 'Māma zài zuòfàn.',
        meaning: 'Mẹ đang nấu ăn.',
        highlight: '在 做饭',
      },
    ],
    practiceQuestions: [
      {
        id: 'q_zhengzai_1',
        type: 'choice',
        prompt: 'Từ nào sau đây KHÔNG thể dùng để diễn tả hành động đang diễn ra?',
        options: ['正在', '在', '已经', '正'],
        correctAnswer: '已经',
        explanation: '"已经" có nghĩa là "đã" (hoàn thành), trái ngược với hành động đang diễn ra.',
      },
    ],
  },
  {
    id: 'g_yibianyibian',
    level: 'HSK3',
    title: 'Cấu trúc song song "一边...一边..." (Yìbiān... yìbiān...)',
    pattern: 'Chủ ngữ + 一边 + Hành động 1 + 一边 + Hành động 2',
    explanation:
      'Diễn tả hai hay nhiều hành động diễn ra song song cùng một thời điểm (vừa... vừa...).',
    usageNotes: [
      'Hai hành động được liên kết phải do cùng một chủ thể thực hiện hoặc đồng thời diễn ra.',
      'Trong giao tiếp có thể nói tắt thành "边...边...".',
    ],
    examples: [
      {
        sentence: '他一边喝咖啡一边听音乐。',
        pinyin: 'Tā yìbiān hē kāfēi yìbiān tīng yīnyuè.',
        meaning: 'Anh ấy vừa uống cà phê vừa nghe nhạc.',
        highlight: '一边 喝咖啡 一边 听音乐',
      },
      {
        sentence: '我们边走边聊吧。',
        pinyin: 'Wǒmen biān zǒu biān liáo ba.',
        meaning: 'Chúng ta vừa đi vừa nói chuyện nhé.',
        highlight: '边 走 边 聊',
      },
    ],
    practiceQuestions: [
      {
        id: 'q_yibian_1',
        type: 'choice',
        prompt: 'Điền từ thích hợp vào chỗ trống: "他_____看书，_____听音乐。"',
        options: ['一边...一边...', '虽然...但是...', '因为...所以...', '越...越...'],
        correctAnswer: '一边...一边...',
        explanation: 'Vừa đọc sách vừa nghe nhạc là hai hành động song song, chọn "一边...一边...".',
      },
    ],
  },
  {
    id: 'g_suiran',
    level: 'HSK2',
    title: 'Cấu trúc nhượng bộ "虽然...但是..." (Suīrán... dànshì...)',
    pattern: '虽然 + Mệnh đề 1, 但是 / 可是 + Mệnh đề 2',
    explanation: 'Diễn tả mối quan hệ nhượng bộ, tương phản: "Tuy / Mặc dù... nhưng...".',
    usageNotes: [
      'Có thể thay "但是" bằng "可是" hoặc "还是" tùy mức độ trang trọng.',
    ],
    examples: [
      {
        sentence: '虽然汉字很难，但是很有趣。',
        pinyin: 'Suīrán hànzì hěn nán, dànshì hěn yǒuqù.',
        meaning: 'Tuy chữ Hán rất khó, nhưng lại rất thú vị.',
        highlight: '虽然 难 但是 有趣',
      },
      {
        sentence: '虽然天气不好，但是他还是去上学了。',
        pinyin: 'Suīrán tiānqì bù hǎo, dànshì tā háishì qù shàngxué le.',
        meaning: 'Tuy thời tiết không tốt, nhưng anh ấy vẫn đi học.',
        highlight: '虽然 不好 但是 还是去',
      },
    ],
    practiceQuestions: [
      {
        id: 'q_suiran_1',
        type: 'choice',
        prompt: 'Cặp từ nối "Tuy... nhưng..." trong tiếng Trung là gì?',
        options: ['虽然...但是...', '因为...所以...', '不但...而且...', '如果...就...'],
        correctAnswer: '虽然...但是...',
        explanation: 'Cấu trúc "Tuy... nhưng..." chuẩn xác là "虽然...但是...".',
      },
    ],
  },
];
