/* 每日金句 —— 本地精选双语库 + 去重 + 开放API兜底 + 收藏
 * 顶部「每日激励语」与金句弹窗共用同一数据源。
 *
 * 数据模型（双语）：
 *   { id, zh, author, source }                  中文金句（zh 为中文正文）
 *   { id, en, zh, author, source }              英文金句（en 为英文正文，zh 为其预置中文翻译）
 *
 * 数据来源（按优先级）：
 *   1) 本地双语库（兜底，离线可用，含已读去重）—— 主力，保证「英文句 + 中文翻译」始终可展示
 *   2) 免Key开放语录API（Quotable，CORS 友好，英文）—— 偶尔注入新鲜英文句
 *      ⚠️ 用户原稿写的是 QuoteVerse API，但 QuoteVerse（dakidarts）需 RapidAPI Key，
 *         并非「免Key免注册」。故默认用同样免Key且支持 CORS 的 Quotable；
 *         如已自备 QuoteVerse Key，把 fetchRemote 里的地址换成
 *         https://quoteverse.p.rapidapi.com/<theme> 并加上 x-rapidapi-key 头即可。
 *
 * 永不重复：每条带唯一 id，已展示 id 存入本地“已读列表”，同日/次日跳过。
 * 每日更新：App 启动检测本地缓存日期，跨天自动换新句。
 */
(function (global) {
  'use strict';

  // —— 本地精选金句库（中文 + 英文含预置中文翻译；可继续扩充）——
  const QUOTES = [
    // ===== 中文金句 =====
    { id: 'q001', zh: '人生没有白走的路，每一步都算数。', author: '胡适', source: '人生随想' },
    { id: 'q002', zh: '不乱于心，不困于情，不畏将来，不念过往。', author: '丰子恺', source: '不宠无惊过一生' },
    { id: 'q003', zh: '你若盛开，蝴蝶自来；你若精彩，天自安排。', author: '佚名', source: '网络' },
    { id: 'q004', zh: '世上无难事，只要肯登攀。', author: '毛泽东', source: '水调歌头' },
    { id: 'q005', zh: '生活不止眼前的苟且，还有诗和远方的田野。', author: '高晓松', source: '歌词' },
    { id: 'q006', zh: '我们听过无数的道理，却仍旧过不好这一生。', author: '韩寒', source: '后会无期' },
    { id: 'q007', zh: '愿你出走半生，归来仍是少年。', author: '佚名', source: '网络' },
    { id: 'q008', zh: '要么孤独，要么庸俗。', author: '叔本华', source: '人生的智慧' },
    { id: 'q009', zh: '一个人只拥有此生此世是不够的，他还应该拥有诗意的世界。', author: '王小波', source: '万寿寺' },
    { id: 'q010', zh: '当你穿过了暴风雨，你早已不再是原来那个人。', author: '村上春树', source: '海边的卡夫卡' },
    { id: 'q011', zh: '在这个世界上，最稀罕的就是认真。', author: '王小波', source: '沉默的大多数' },
    { id: 'q012', zh: '世上只有一种英雄主义，就是在认清生活真相之后依然热爱生活。', author: '罗曼·罗兰', source: '米开朗基罗传' },
    { id: 'q013', zh: '一个人知道自己为什么而活，就可以忍受任何一种生活。', author: '尼采', source: '尼采文集' },
    { id: 'q014', zh: '凡是过往，皆为序章。', author: '莎士比亚', source: '暴风雨' },
    { id: 'q015', zh: '不要因为走得太远，而忘记为什么出发。', author: '纪伯伦', source: '先知' },
    { id: 'q016', zh: '与其在悬崖上展览千年，不如在爱人肩头痛哭一晚。', author: '舒婷', source: '神女峰' },
    { id: 'q017', zh: '世界以痛吻我，要我报之以歌。', author: '泰戈尔', source: '飞鸟集' },
    { id: 'q018', zh: '当你为错过太阳而哭泣时，你也要再错过群星了。', author: '泰戈尔', source: '飞鸟集' },
    { id: 'q019', zh: '心之所向，素履以往；生如逆旅，一苇以航。', author: '《诗经》绎', source: '网络' },
    { id: 'q020', zh: '宠辱不惊，看庭前花开花落；去留无意，望天上云卷云舒。', author: '洪应明', source: '菜根谭' },
    { id: 'q021', zh: '路漫漫其修远兮，吾将上下而求索。', author: '屈原', source: '离骚' },
    { id: 'q022', zh: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子', source: '劝学' },
    { id: 'q023', zh: '三军可夺帅也，匹夫不可夺志也。', author: '孔子', source: '论语' },
    { id: 'q024', zh: '知者不惑，仁者不忧，勇者不惧。', author: '孔子', source: '论语' },
    { id: 'q025', zh: '吾生也有涯，而知也无涯。', author: '庄子', source: '养生主' },
    { id: 'q026', zh: '志之所趋，无远弗届；穷山距海，不能限也。', author: '《格言联璧》', source: '网络' },
    { id: 'q027', zh: '真正的平静，不是避开车马喧嚣，而是在心中修篱种菊。', author: '白落梅', source: '你若安好便是晴天' },
    { id: 'q028', zh: '你一定要走吗，可你曾听说，前面路上有风光。', author: '席慕蓉', source: '回收' },
    { id: 'q029', zh: '我用手里的金钱，去买能让我安静下来的书。', author: '杨绛', source: '我们仨' },
    { id: 'q030', zh: '我们曾如此渴望命运的波澜，到最后才发现，人生最曼妙的风景，竟是内心的淡定与从容。', author: '杨绛', source: '一百岁感言' },
    { id: 'q031', zh: '惟有身处卑微的人，最有机缘看到世态人情的真相。', author: '杨绛', source: '我们仨' },
    { id: 'q032', zh: '其实地上本没有路，走的人多了，也便成了路。', author: '鲁迅', source: '故乡' },
    { id: 'q033', zh: '横眉冷对千夫指，俯首甘为孺子牛。', author: '鲁迅', source: '自嘲' },
    { id: 'q034', zh: '时间就像海绵里的水，只要愿挤，总还是有的。', author: '鲁迅', source: '后记' },
    { id: 'q035', zh: '当你凝视深渊时，深渊也在凝视着你。', author: '尼采', source: '善恶的彼岸' },
    { id: 'q036', zh: '那些杀不死我的，必将使我更强大。', author: '尼采', source: '偶像的黄昏' },
    { id: 'q037', zh: '人的一切痛苦，本质上都是对自己无能的愤怒。', author: '王小波', source: '沉默的大多数' },
    { id: 'q038', zh: '生活是种律动，须有光有影，有左有右，有晴有雨。', author: '老舍', source: '小病' },
    { id: 'q039', zh: '把每一个平凡的日子，都过成限量版。', author: '佚名', source: '网络' },
    { id: 'q040', zh: '慢一点，灵魂才能跟得上。', author: '佚名', source: '网络' },
    { id: 'q041', zh: '怕什么真理无穷，进一寸有一寸的欢喜。', author: '胡适', source: '日记' },
    { id: 'q042', zh: '既然选择了远方，便只顾风雨兼程。', author: '汪国真', source: '热爱生命' },
    { id: 'q043', zh: '没有比脚更长的路，没有比人更高的山。', author: '汪国真', source: '山高路远' },
    { id: 'q044', zh: '黑夜给了我黑色的眼睛，我却用它寻找光明。', author: '顾城', source: '一代人' },
    { id: 'q045', zh: '草在结它的种子，风在摇它的叶子，我们站着，不说话，就十分美好。', author: '顾城', source: '门前' },
    { id: 'q046', zh: '卑鄙是卑鄙者的通行证，高尚是高尚者的墓志铭。', author: '北岛', source: '回答' },
    { id: 'q047', zh: '人的一生应当这样度过：当他回首往事时，不因虚度年华而悔恨。', author: '奥斯特洛夫斯基', source: '钢铁是怎样炼成的' },
    { id: 'q048', zh: '幸福的家庭都是相似的，不幸的家庭各有各的不幸。', author: '托尔斯泰', source: '安娜·卡列尼娜' },
    { id: 'q049', zh: '所有的伟大，都源于一个勇敢的开始。', author: '佚名', source: '网络' },
    { id: 'q050', zh: '你今天受的苦，吃的亏，担的责，都会变成光，照亮你的路。', author: '佚名', source: '网络' },
    { id: 'q051', zh: '把脸一直向着阳光，这样就不会见到阴影。', author: '海伦·凯勒', source: '语录' },
    { id: 'q052', zh: '虽然明天还会有新的太阳，但永远不会有今天的太阳了。', author: '林清玄', source: '境明，千里皆明' },
    { id: 'q053', zh: '以清净心看世界，以欢喜心过生活。', author: '林清玄', source: '人生最美是清欢' },
    { id: 'q054', zh: '浪漫是什么？是陪你一起慢慢变老。', author: '佚名', source: '网络' },
    { id: 'q055', zh: '愿你一生努力，一生被爱，想要的都拥有，得不到的都释怀。', author: '佚名', source: '网络' },
    { id: 'q056', zh: '我们单枪匹马，闯入这世间，只为活出属于自己的所有可能。', author: '佚名', source: '网络' },
    { id: 'q057', zh: '所谓自由，不是随心所欲，而是自我主宰。', author: '康德', source: '实践理性批判' },
    { id: 'q058', zh: '有两样东西，我愈是思考愈觉敬畏：头顶的星空与心中的道德律。', author: '康德', source: '实践理性批判' },
    { id: 'q059', zh: '耐心和持久胜过激烈和狂热。', author: '拉·封丹', source: '寓言' },
    { id: 'q060', zh: '走得最慢的人，只要他不丧失目标，也比漫无目的徘徊的人走得快。', author: '莱辛', source: '语录' },
    { id: 'q061', zh: '读一本好书，就是和许多高尚的人谈话。', author: '歌德', source: '格言' },
    { id: 'q062', zh: '谁若是游戏人生，他就一事无成。', author: '歌德', source: '格言' },
    { id: 'q063', zh: '今天所做之事勿候明天，自己所做之事勿候他人。', author: '歌德', source: '格言' },
    { id: 'q064', zh: '假如生活欺骗了你，不要悲伤，不要心急。', author: '普希金', source: '假如生活欺骗了你' },
    { id: 'q065', zh: '把每一滴眼泪，都化作滋养生命的雨。', author: '佚名', source: '网络' },
    { id: 'q066', zh: '你只管努力，剩下的交给时间。', author: '佚名', source: '网络' },
    { id: 'q067', zh: '星光不问赶路人，时光不负有心人。', author: '佚名', source: '网络' },
    { id: 'q068', zh: '每一个不曾起舞的日子，都是对生命的辜负。', author: '尼采', source: '查拉图斯特拉如是说' },
    { id: 'q069', zh: '万物皆有裂痕，那是我光照进来的地方。', author: '莱昂纳德·科恩', source: 'Anthem' },
    { id: 'q070', zh: '有时候，你比别人多一点执着，就会多一点机会。', author: '佚名', source: '网络' },
    { id: 'q071', zh: '把喜欢的事做到极致，你就赢了大多数人。', author: '佚名', source: '网络' },
    { id: 'q072', zh: '所有运气，都是努力的伏笔。', author: '佚名', source: '网络' },
    { id: 'q073', zh: '温柔要有，但不是妥协，我们要在安静中，不慌不忙地坚强。', author: '林徽因', source: '语录' },
    { id: 'q074', zh: '答案很长，我准备用一生的时间来回答，你准备要听了吗？', author: '林徽因', source: '语录' },
    { id: 'q075', zh: '不乱于心，不困于情。', author: '丰子恺', source: '不宠无惊过一生' },
    { id: 'q076', zh: '你所站立的地方，就是你的中国；你怎么样，中国便怎么样。', author: '卢新宁', source: '演讲' },
    { id: 'q077', zh: '愿中国青年都摆脱冷气，只是向上走。', author: '鲁迅', source: '热风' },
    { id: 'q078', zh: '昨日种种，皆成今我，切莫思量，更莫哀。', author: '王国维', source: '采桑子' },
    { id: 'q079', zh: '既然目标是地平线，留给世界的只能是背影。', author: '汪国真', source: '热爱生命' },
    { id: 'q080', zh: '我们可以失望，但不能盲目。', author: '刘瑜', source: '送你一颗子弹' },
    { id: 'q081', zh: '来日方长，何惧车遥马慢。', author: '佚名', source: '网络' },
    { id: 'q082', zh: '且将新火试新茶，诗酒趁年华。', author: '苏轼', source: '望江南' },
    { id: 'q083', zh: '知足且上进，温柔且坚定。', author: '佚名', source: '网络' },
    { id: 'q084', zh: '快乐不是因为拥有的多，而是计较的少。', author: '佚名', source: '网络' },
    { id: 'q085', zh: '星光璀璨，不如你眼里的光。', author: '佚名', source: '网络' },
    { id: 'q086', zh: '所有的遗憾，都是成全。', author: '佚名', source: '网络' },
    { id: 'q087', zh: '心若有光，又何惧山高水长。', author: '佚名', source: '网络' },
    { id: 'q088', zh: '你若安好，便是晴天。', author: '佚名', source: '网络' },
    { id: 'q089', zh: '愿有岁月可回首，且以深情共白头。', author: '佚名', source: '网络' },
    { id: 'q090', zh: '岁月失语，惟石能言。', author: '冯骥才', source: '语录' },

    // ===== 英文金句（en 为英文正文，zh 为预置中文翻译）=====
    { id: 'e001', en: 'The only way to do great work is to love what you do.', zh: '成就伟业的唯一途径，是热爱你所做的事。', author: 'Steve Jobs' },
    { id: 'e002', en: 'Stay hungry, stay foolish.', zh: '求知若饥，虚心若愚。', author: 'Steve Jobs' },
    { id: 'e003', en: 'Your time is limited, so don’t waste it living someone else’s life.', zh: '你的时间有限，不要把它浪费在重复别人的人生上。', author: 'Steve Jobs' },
    { id: 'e004', en: 'The future belongs to those who believe in the beauty of their dreams.', zh: '未来属于那些相信梦想之美的人。', author: 'Eleanor Roosevelt' },
    { id: 'e005', en: 'It does not matter how slowly you go as long as you do not stop.', zh: '只要不停下脚步，走得慢也无妨。', author: '孔子' },
    { id: 'e006', en: 'Our greatest glory is not in never falling, but in rising every time we fall.', zh: '我们最大的荣耀，不在于永不跌倒，而在于每次跌倒后都能站起。', author: '孔子' },
    { id: 'e007', en: 'Well done is better than well said.', zh: '行胜于言。', author: 'Benjamin Franklin' },
    { id: 'e008', en: 'The secret of getting ahead is getting started.', zh: '领先的秘诀，在于开始行动。', author: 'Mark Twain' },
    { id: 'e009', en: 'Twenty years from now you will be more disappointed by the things you didn’t do.', zh: '二十年后，让你后悔的将是你没做的事，而非做过的事。', author: 'Mark Twain' },
    { id: 'e010', en: 'Whether you think you can or you think you can’t, you’re right.', zh: '无论你认为自己能，还是不能，你都是对的。', author: 'Henry Ford' },
    { id: 'e011', en: 'I have not failed. I’ve just found 10,000 ways that won’t work.', zh: '我并未失败，只是找到了一万种行不通的方法。', author: 'Thomas Edison' },
    { id: 'e012', en: 'Genius is one percent inspiration and ninety-nine percent perspiration.', zh: '天才是百分之一的灵感，加百分之九十九的汗水。', author: 'Thomas Edison' },
    { id: 'e013', en: 'The only limit to our realization of tomorrow is our doubts of today.', zh: '实现明天的唯一阻碍，是今天的疑虑。', author: 'Franklin D. Roosevelt' },
    { id: 'e014', en: 'Believe you can and you’re halfway there.', zh: '相信自己能，你就已经成功了一半。', author: 'Theodore Roosevelt' },
    { id: 'e015', en: 'It always seems impossible until it’s done.', zh: '在做成之前，一切总显得不可能。', author: 'Nelson Mandela' },
    { id: 'e016', en: 'I learned that courage was not the absence of fear, but the triumph over it.', zh: '我懂得，勇气并非没有恐惧，而是战胜恐惧。', author: 'Nelson Mandela' },
    { id: 'e017', en: 'Education is the most powerful weapon which you can use to change the world.', zh: '教育是你能用来改变世界的最有力武器。', author: 'Nelson Mandela' },
    { id: 'e018', en: 'The beautiful thing about learning is that no one can take it away from you.', zh: '学习的美好在于，无人能将它从你身上夺走。', author: 'B.B. King' },
    { id: 'e019', en: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', zh: '像明天就会死去那样生活，像永远活着那样学习。', author: 'Gandhi' },
    { id: 'e020', en: 'You must be the change you wish to see in the world.', zh: '欲变世界，先变自身。', author: 'Gandhi' },
    { id: 'e021', en: 'Happiness is when what you think, what you say, and what you do are in harmony.', zh: '幸福，是所想、所言、所行三者和谐一致。', author: 'Gandhi' },
    { id: 'e022', en: 'A journey of a thousand miles begins with a single step.', zh: '千里之行，始于足下。', author: 'Lao Tzu' },
    { id: 'e023', en: 'Nature does not hurry, yet everything is accomplished.', zh: '大自然从不匆忙，却成就一切。', author: 'Lao Tzu' },
    { id: 'e024', en: 'When I let go of what I am, I become what I might be.', zh: '放下执念，方能成为可能的自己。', author: 'Lao Tzu' },
    { id: 'e025', en: 'Knowing yourself is the beginning of all wisdom.', zh: '认识自己，是一切智慧的开端。', author: 'Aristotle' },
    { id: 'e026', en: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', zh: '我们重复做的事，造就了我们；卓越不是行为，而是习惯。', author: 'Aristotle' },
    { id: 'e027', en: 'The unexamined life is not worth living.', zh: '未经审视的人生，不值得过。', author: 'Socrates' },
    { id: 'e028', en: 'The only true wisdom is in knowing you know nothing.', zh: '唯一的真智慧，是知道自己一无所知。', author: 'Socrates' },
    { id: 'e029', en: 'Courage is not the absence of fear, but the judgment that something else is more important.', zh: '勇气不是没有恐惧，而是判断有更重要的事值得去做。', author: 'Ambrose Redmoon' },
    { id: 'e030', en: 'Keep your face to the sunshine and you cannot see the shadow.', zh: '面朝阳光，便看不见阴影。', author: 'Helen Keller' },
    { id: 'e031', en: 'Life is either a daring adventure or nothing at all.', zh: '生命要么是一场大胆的冒险，要么一无所有。', author: 'Helen Keller' },
    { id: 'e032', en: 'Optimism is the faith that leads to achievement.', zh: '乐观，是通向成就的信念。', author: 'Helen Keller' },
    { id: 'e033', en: 'The best way out is always through.', zh: '最好的出路，永远是穿过去。', author: 'Robert Frost' },
    { id: 'e034', en: 'Two roads diverged in a wood, and I took the one less traveled by.', zh: '林中有两条路，我选择了人迹更少的那条。', author: 'Robert Frost' },
    { id: 'e035', en: 'In three words I can sum up everything I’ve learned about life: it goes on.', zh: '关于人生，我可用三个字总结：它继续。', author: 'Robert Frost' },
    { id: 'e036', en: 'Fall seven times, stand up eight.', zh: '七次跌倒，八次站起。', author: '日本谚语' },
    { id: 'e037', en: 'A smooth sea never made a skilled sailor.', zh: '平静的海面，造就不了熟练的水手。', author: 'Franklin D. Roosevelt' },
    { id: 'e038', en: 'Difficulties strengthen the mind, as labor does the body.', zh: '困难磨炼心智，如同劳作强健体魄。', author: 'Seneca' },
    { id: 'e039', en: 'Every new beginning comes from some other beginning’s end.', zh: '每一次新的开始，都源于另一段结束。', author: 'Seneca' },
    { id: 'e040', en: 'Luck is what happens when preparation meets opportunity.', zh: '运气，是准备遇上机遇时发生的事。', author: 'Seneca' },
    { id: 'e041', en: 'We suffer more often in imagination than in reality.', zh: '我们想象的苦难，往往多于现实。', author: 'Seneca' },
    { id: 'e042', en: 'The impediment to action advances action. What stands in the way becomes the way.', zh: '阻碍行动的事物，反而推动行动；挡路之物，即为前路。', author: 'Marcus Aurelius' },
    { id: 'e043', en: 'You have power over your mind — not outside events. Realize this, and you will find strength.', zh: '你能掌控自己的心，而非外界之事；明白这点，你便找到力量。', author: 'Marcus Aurelius' },
    { id: 'e044', en: 'When you arise in the morning, think of what a precious privilege it is to be alive.', zh: '清晨醒来，想想活着是何等珍贵的恩赐。', author: 'Marcus Aurelius' },
    { id: 'e045', en: 'Dwell on the beauty of life. Watch the stars, and see yourself running with them.', zh: '凝望生命之美，看星辰，仿佛与之同行。', author: 'Marcus Aurelius' },
    { id: 'e046', en: 'Happiness depends upon ourselves.', zh: '幸福取决于我们自己。', author: 'Aristotle' },
    { id: 'e047', en: 'And those who were seen dancing were thought to be insane by those who could not hear the music.', zh: '那些起舞的人，在被听不见音乐的人眼中是疯子。', author: 'Friedrich Nietzsche' },
    { id: 'e048', en: 'He who has a why to live can bear almost any how.', zh: '知晓为何而活的人，几乎能承受任何怎样活。', author: 'Friedrich Nietzsche' },
    { id: 'e049', en: 'Don’t watch the clock; do what it does. Keep going.', zh: '别盯着时钟，学它一样不停前行。', author: 'Sam Levenson' },
    { id: 'e050', en: 'Little by little, one travels far.', zh: '一点一滴，终行致远。', author: 'J.R.R. Tolkien' },
    { id: 'e051', en: 'It is not our abilities that show what we truly are, it is our choices.', zh: '定义我们的不是能力，而是选择。', author: 'J.K. Rowling' },
    { id: 'e052', en: 'Happiness can be found even in the darkest of times, if one only remembers to turn on the light.', zh: '即使在最黑暗的时刻，只要记得点亮灯火，也能找到幸福。', author: 'J.K. Rowling' },
    { id: 'e053', en: 'You sort of start thinking anything’s possible if you’ve got enough nerve.', zh: '若够勇敢，你会开始相信一切皆有可能。', author: 'J.K. Rowling' },
    { id: 'e054', en: 'Do what you can, with what you have, where you are.', zh: '在你所在之处，用你所有，做你所能。', author: 'Theodore Roosevelt' },
    { id: 'e055', en: 'That which does not kill us makes us stronger.', zh: '凡杀不死我的，必使我更强大。', author: 'Friedrich Nietzsche' }
  ];

  const LS_SHOWN = 'wb_quote_shown';
  const LS_TODAY = 'wb_quote_today';
  const LS_DATE = 'wb_quote_date';
  const LS_FAVS = 'wb_quote_favs';

  function hash(str) {
    let h = 0;
    str = String(str);
    for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
    return 'h' + (h >>> 0).toString(36);
  }
  function getShown() { try { return JSON.parse(localStorage.getItem(LS_SHOWN) || '[]'); } catch (e) { return []; } }
  function setShown(a) { try { localStorage.setItem(LS_SHOWN, JSON.stringify(a.slice(-600))); } catch (e) {} }
  function getFavs() { try { return JSON.parse(localStorage.getItem(LS_FAVS) || '[]'); } catch (e) { return []; } }
  function setFavs(a) { try { localStorage.setItem(LS_FAVS, JSON.stringify(a)); } catch (e) {} }
  function quoteId(q) { return q.id || hash(q.en || q.zh || q.text || ''); }

  // 显示用文本：返回 { main, sub }
  // main: “正文” —— 作者（中文含出处；英文无出处）
  // sub : 英文句对应的中文翻译（仅英文句有）
  function displayLines(q) {
    if (q.en) {
      return { main: '“' + q.en + '” —— ' + (q.author || '佚名'), sub: q.zh || '' };
    }
    return { main: '“' + (q.zh || q.text || '') + '” —— ' + (q.author || '佚名') + (q.source ? '《' + q.source + '》' : ''), sub: '' };
  }

  function unshownLocal() {
    const shown = new Set(getShown());
    return QUOTES.filter(q => !shown.has(quoteId(q)));
  }
  function pickLocal() {
    const pool = unshownLocal();
    const arr = pool.length ? pool : QUOTES;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function markShown(q) {
    const id = quoteId(q);
    if (!id) return;
    const s = getShown();
    if (!s.includes(id)) { s.push(id); setShown(s); }
  }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  // 纯本地双语库（145 条精选）：离线可用、无第三方请求、隐私安全。
  // 说明：旧版有 25% 概率调用 api.quotable.io 拉取新鲜英文句，但会带来隐私泄露（每次打开约 1/4 概率向第三方发请求）、
  // 离线时的无意义网络尝试、以及第三方服务不稳导致的不确定性。本地库已足够丰富，故改为 100% 本地。
  async function getDailyQuote(force) {
    const key = todayKey();
    const date = localStorage.getItem(LS_DATE);
    if (!force && date === key) {
      try { const c = JSON.parse(localStorage.getItem(LS_TODAY) || 'null'); if (c) return c; } catch (e) {}
    }
    const q = pickLocal();
    markShown(q);
    try { localStorage.setItem(LS_TODAY, JSON.stringify(q)); localStorage.setItem(LS_DATE, key); } catch (e) {}
    return q;
  }
  function nextQuote() {
    const q = pickLocal();
    markShown(q);
    try { localStorage.setItem(LS_TODAY, JSON.stringify(q)); localStorage.setItem(LS_DATE, todayKey()); } catch (e) {}
    return q;
  }
  function isFav(q) {
    const key = quoteId(q);
    return getFavs().some(f => quoteId(f) === key);
  }
  function toggleFav(q) {
    const key = quoteId(q);
    const favs = getFavs();
    const i = favs.findIndex(f => quoteId(f) === key);
    let faved;
    if (i >= 0) { favs.splice(i, 1); faved = false; }
    else { favs.unshift(q); faved = true; }
    setFavs(favs);
    return faved;
  }
  function startDailyCheck() {
    setInterval(() => {
      if (localStorage.getItem(LS_DATE) !== todayKey()) {
        getDailyQuote(true).then(() => { if (window.QuoteUI) window.QuoteUI.refreshBanner(); });
      }
    }, 60000);
  }

  global.QuoteService = {
    QUOTES, getDailyQuote, nextQuote, isFav, toggleFav, getFavs, startDailyCheck, hash, displayLines, quoteId
  };
})(window);

/* ===== 金句弹窗 UI ===== */
(function () {
  'use strict';
  const S = window.QuoteService;
  let current = null;
  const $ = function (id) { return document.getElementById(id); };
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function showToast(msg) {
    const c = $('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 1800);
  }
  function render(q) {
    current = q;
    const textEl = $('quoteModalText');
    const authEl = $('quoteModalAuthor');
    if (q.en) {
      textEl.textContent = '“' + q.en + '”';
      authEl.textContent = (q.zh ? q.zh + '\n' : '') + '—— ' + (q.author || '佚名');
    } else {
      textEl.textContent = '“' + (q.zh || q.text || '') + '”';
      authEl.textContent = '—— ' + (q.author || '佚名') + (q.source ? '《' + q.source + '》' : '');
    }
    const fav = $('quoteFavButton');
    if (fav) fav.textContent = S.isFav(q) ? '★ 已收藏' : '☆ 收藏';
    updateFavList();
  }
  function open() { if (current) $('quoteModal').hidden = false; }
  function close() { $('quoteModal').hidden = true; }
  function next() { render(S.nextQuote()); }
  function toggleFav() {
    if (!current) return;
    const faved = S.toggleFav(current);
    const fb = $('quoteFavButton');
    if (fb) fb.textContent = faved ? '★ 已收藏' : '☆ 收藏';
    updateFavList();
    showToast(faved ? '已收藏到金句库 💛' : '已取消收藏');
  }
  function updateFavList() {
    const list = $('quoteFavList');
    if (!list) return;
    const btn = $('quoteFavListButton');
    const favs = S.getFavs();
    if (btn) btn.textContent = '查看收藏（' + favs.length + '）';
    list.innerHTML = favs.length
      ? favs.map(function (f) {
          const body = f.en
            ? ('“' + escapeHtml(f.en) + '”' + (f.zh ? '<br><span style="color:var(--text-secondary);font-size:12px;font-style:italic">' + escapeHtml(f.zh) + '</span>' : ''))
            : ('“' + escapeHtml(f.zh || f.text || '') + '”');
          return '<div class="quote-fav-item"><div class="qfi-text">' + body + '</div><div class="qfi-author">—— ' + escapeHtml(f.author || '佚名') + (f.source ? '《' + escapeHtml(f.source) + '》' : '') + '</div></div>';
        }).join('')
      : '<div style="color:var(--text-secondary);font-size:13px;">还没有收藏的金句，点击「收藏」保存喜欢的句子吧 💛</div>';
  }
  function translateInline(f) {
    if (f.en) return '“' + f.en + '”' + (f.zh ? '\n' + f.zh : '');
    return '“' + (f.zh || f.text || '') + '”';
  }
  function toggleFavList() {
    const list = $('quoteFavList');
    if (!list) return;
    if (!list.hidden) { list.hidden = true; return; }
    updateFavList();
    list.hidden = false;
  }
  function setBanner(q) {
    const t = $('quoteBannerText');
    const tr = $('quoteBannerTrans');
    if (!t) return;
    if (q.en) {
      t.textContent = '“' + q.en + '” —— ' + (q.author || '佚名');
      if (tr) { if (q.zh) { tr.textContent = q.zh; tr.hidden = false; } else { tr.textContent = ''; tr.hidden = true; } }
    } else {
      t.textContent = '“' + (q.zh || q.text || '') + '” —— ' + (q.author || '佚名') + (q.source ? '《' + q.source + '》' : '');
      if (tr) { tr.textContent = ''; tr.hidden = true; }
    }
  }
  function refreshBanner() { S.getDailyQuote(false).then(function (q) { render(q); setBanner(q); }); }

  function init() {
    const banner = $('quoteBanner');
    if (banner) banner.onclick = open;
    const ov = $('quoteModal');
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    // 兼容弹窗内按钮（id 可能带 Button 后缀）
    const fav = $('quoteFavButton'); if (fav) fav.onclick = toggleFav;
    const nxt = $('quoteNextButton'); if (nxt) nxt.onclick = next;
    const favList = $('quoteFavListButton'); if (favList) favList.onclick = toggleFavList;
    S.getDailyQuote(false).then(function (q) { render(q); setBanner(q); });
    S.startDailyCheck();
  }

  window.QuoteUI = { init: init, open: open, close: close, next: next, toggleFav: toggleFav, toggleFavList: toggleFavList, refreshBanner: refreshBanner };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
