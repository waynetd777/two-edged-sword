# Copyright © 2026 Wayne Davies. Free software under the GNU General Public License, version 3 or later.
# SPDX-License-Identifier: GPL-3.0-or-later. See LICENSE in the project root.
"""A short history of each module the tools build: who made the work, when and why, and how it has come down to us.
`modules.module()` puts it in each module's description as it is written, a paragraph headed "History." after the
first (what the module is); a "+" edition has its plain edition's, and every Talmud tractate the Talmud's.

    python3 tools/history.py apply <folder>

adds or replaces it in the modules already built in a folder.
"""
import re
import sqlite3
import sys
from pathlib import Path

HISTORY = {
    # Bibles: English
    "kjv": "In 1604 King James I agreed, at the Hampton Court Conference, to a new translation for the Church of England. About 47 scholars in six companies, at Westminster, Oxford and Cambridge, worked from the Hebrew and Greek and from the English Bibles before them, above all Tyndale's, and it was published in 1611. The text read today is Benjamin Blayney's Oxford edition of 1769, which made its spelling and punctuation regular. For three centuries it was the Bible of the English-speaking world.",
    "webster": "Noah Webster, the American lexicographer, published this revision of the King James Version in 1833. He kept its wording but changed words whose meaning had shifted or that he thought indelicate, and modernised grammar and spelling. He thought it the most important work of his life.",
    "rv": "In 1870 the Convocation of Canterbury began a revision of the King James Version, to bring it into line with the Hebrew and Greek texts as scholars then read them. The New Testament appeared in 1881, Westcott and Hort's Greek text guiding it, the Old in 1885 and the Apocrypha in 1895. It was the first officially sanctioned revision of the KJV.",
    "asv": "American scholars worked beside the British revisers of the 1870s and agreed to wait before publishing their own preferences. Their edition, published in 1901, is the Revised Version with those preferences in the text, among them \"Jehovah\" for the divine name. Its literal style made it a favourite for study, and it is the basis of the RSV and the NASB.",
    "ylt": "Robert Young, a Scottish bookseller and scholar best known for his Analytical Concordance (1879), published his Literal Translation in 1862, revised in 1887 and 1898. He followed the Hebrew and Greek word for word and tense for tense, to show readers what the original says rather than to read smoothly.",
    "darby": "John Nelson Darby, an Anglican clergyman who became a leader of the Plymouth Brethren, translated the Bible into German and French as well as English. His English New Testament appeared in 1867 and was revised until his death in 1882; the Old Testament was finished from his work by those who knew it, and the whole was published in 1890.",
    "web": "The World English Bible was begun in 1994 by Michael Paul Johnson and volunteers, as a modern-English revision of the American Standard Version of 1901, its New Testament following the Byzantine Majority Text. It was dedicated to the public domain from the start, so that it could be copied, quoted and published freely.",
    "bsb": "The Berean Standard Bible was translated by a team working with Bible Hub. Its New Testament was published in 2016 and the whole Bible after it, as the Berean Study Bible. In 2023, as the Berean Standard Bible, it was dedicated to the public domain, so that God's word could be freely shared.",
    "weymouth": "Richard Francis Weymouth, a headmaster and Greek scholar, made his own Greek text (the Resultant Greek Testament, 1886) from the major editions of his day, and then translated it into the English of his time. He died in 1902, and the New Testament in Modern Speech was published in 1903, edited by Ernest Hampden-Cook.",
    "mkjv1993": "Jay P. Green Sr. spent his life making the Bible's original languages plain to English readers: his Interlinear Bible and his Literal Translation are still in print. His Modern King James Version, completed in the 1990s, keeps the King James Version's Hebrew and Greek texts while putting its English into modern words.",
    "geneva1599": "English Protestants who fled to Geneva in Mary I's reign translated the Geneva Bible there: the New Testament in 1557 and the whole Bible in 1560. It was the first English Bible with verse numbers throughout, printed in clear roman type, with notes in the margins. It was the Bible of Shakespeare, of John Bunyan and of the Pilgrims, and it stayed popular long after 1611. This printing, of 1599, has Laurence Tomson's revised New Testament.",
    "tyndale": "William Tyndale set out to make the Bible plain enough that \"a boy that driveth the plough\" could know it. Forbidden to translate in England, he worked abroad: his New Testament, from Erasmus' Greek, was printed at Worms in 1526 and smuggled into England, and he revised it in 1534. He went on to the Pentateuch (1530) and Jonah (1531), but was betrayed, and in 1536 he was strangled and burned at Vilvoorde, praying \"Lord, open the King of England's eyes.\" Much of the King James Version's New Testament is his wording.",
    "rheims1582": "English Catholic exiles founded a college at Douai in Flanders in 1568, which moved to Reims for a time. There Gregory Martin, with William Allen and others, translated the New Testament from the Latin Vulgate, published at Reims in 1582 with notes answering the Protestant versions; the Old Testament followed at Douai in 1609–1610. The King James translators consulted it, and some of its Latinate words reached the KJV.",
    "drc": "The Douay-Rheims Bible, the English Catholic translation from the Vulgate (New Testament Rheims 1582, Old Testament Douay 1609–1610), was revised in 1749–1752 by Richard Challoner, a Catholic bishop in London. He modernised its English, often towards the King James Version's, and his revision was the Bible of English-speaking Catholics until the twentieth century.",
    "brenton": "Sir Lancelot Brenton, son of Admiral Sir Jahleel Brenton, published his English translation of the Septuagint in 1844, from the Vatican Codex as printed in the Sixtine edition of 1587. It was for long the only complete English Septuagint, and showed English readers the Old Testament that the apostles quoted.",
    "murdock": "James Murdock, an American Congregational minister and professor, learned Syriac to translate the Peshitta, the Bible of the Syriac churches. His literal New Testament was published in 1852, so that English readers could see an ancient version that was not Greek or Latin.",
    "etheridge": "John Wesley Etheridge, a Methodist minister and scholar of Syriac, Hebrew and Aramaic, translated the Peshitta New Testament: the Gospels in 1846 and the Acts and Epistles in 1849. He went on to translate the Targums of the Pentateuch (1862–1865).",
    # Bibles: the original languages and the ancient versions
    "byz": "The Byzantine text is the Greek New Testament as most surviving manuscripts give it, the text of the Greek churches for a thousand years. Maurice Robinson and William Pierpont edited it from the manuscripts' majority readings; their first edition appeared in 1991, and this one, of 2018, they placed in the public domain.",
    "tr1550": "Robert Estienne (Stephanus), the royal printer in Paris, published four editions of the Greek New Testament. His third, of 1550, the \"Editio Regia\", was the first printed with variant readings from manuscripts in its margins; his fourth (Geneva, 1551) gave the New Testament the verse numbers still used. The 1550 text became the standard form of the Textus Receptus in Britain.",
    "beza1598": "Theodore Beza, Calvin's successor at Geneva, published nine editions of the Greek New Testament between 1565 and 1604, with his own Latin translation and notes. He owned two ancient manuscripts, among them the Codex Bezae, though he made little use of them. His edition of 1598 was the Greek text the King James translators had most in hand.",
    "wlc": "The Leningrad Codex was copied in Cairo around 1008, in the tradition of the Ben Asher family of Masoretes, and is the oldest complete manuscript of the Hebrew Bible. It is the basis of Biblia Hebraica Stuttgartensia, and the Westminster Leningrad Codex is the electronic text of it made by the J. Alan Groves Center at Westminster Theological Seminary.",
    "ginsburg": "Christian David Ginsburg, born a Jew in Warsaw, came to faith in Christ and gave his life to the Masoretic text. His Hebrew Bible of 1894, made for the Trinitarian Bible Society, follows the text of Jacob ben Chayyim's Rabbinic Bible (Bomberg, Venice, 1524–1525), the Hebrew from which the King James Old Testament was translated.",
    "lxx_brenton": "The Septuagint, the Greek Old Testament, was begun in Alexandria in the third century BC, when the Law was translated for the Greek-speaking Jews there (legend tells of seventy-two translators); the other books followed by about 100 BC. It was the Bible of the early church and is quoted throughout the New Testament. This text is the Vatican Codex as the Sixtine edition (Rome, 1587) printed it, as Brenton published it in 1851.",
    "clementine": "Jerome translated the Bible into Latin at Pope Damasus' request, from about 382 to 405: the Vulgate, the Bible of the Western church for a thousand years. After the Council of Trent called for an authoritative edition, Pope Sixtus V issued one in 1590, which was soon withdrawn; Pope Clement VIII's corrected edition of 1592 was the Catholic Church's standard Latin Bible until 1979.",
    "latin": "Jerome, the greatest scholar of the early church, was asked by Pope Damasus in 382 to revise the Latin Gospels. He went on to translate most of the Old Testament from the Hebrew, at Bethlehem, finishing about 405. His translation, the Vulgate (\"common\" version), became the Bible of the Western church for a thousand years; modern critical editions recover his text from the oldest manuscripts.",
    "peshitta": "The Peshitta (\"simple\" version) is the Syriac Bible, the Scripture of the churches of the East since the fifth century, in a language close to the Aramaic Jesus spoke. Its New Testament has 22 books; 2 Peter, 2 and 3 John, Jude and Revelation came into Syriac later. This text is the British and Foreign Bible Society's edition of 1905, from the work of Philip Pusey and George Gwilliam.",
    "targum_aramaic": "When Aramaic replaced Hebrew as the Jews' everyday language, a translator stood beside the reader in the synagogue and gave the Scripture in Aramaic: the Targum (\"translation\"). Targum Onkelos on the Law and Targum Jonathan on the Prophets were given their final form in Babylonia, perhaps in the third to fifth centuries, and became the official Targums; the Targums of the Writings are later.",
    "targum_english": "When Aramaic replaced Hebrew as the Jews' everyday language, a translator stood beside the reader in the synagogue and gave the Scripture in Aramaic: the Targum (\"translation\"). Targum Onkelos on the Law and Targum Jonathan on the Prophets were given their final form in Babylonia, perhaps in the third to fifth centuries; the Targums of the Writings are later. Their English translations were made in the twentieth and twenty-first centuries.",
    "pseudojonathan_aramaic": "Targum Pseudo-Jonathan is a Palestinian Targum of the Law, rich in stories and teaching added to the text. It was once ascribed to Jonathan ben Uzziel, probably by misreading an abbreviation for \"Jerusalem Targum\", hence \"Pseudo\". Its traditions are old, but its final form is late: it names wives of Ishmael that recall Muhammad's family, so it was finished after the seventh century.",
    "pseudojonathan_english": "Targum Pseudo-Jonathan is a Palestinian Targum of the Law, rich in stories and teaching added to the text. It was once ascribed to Jonathan ben Uzziel, probably by misreading an abbreviation for \"Jerusalem Targum\", hence \"Pseudo\". Its traditions are old, but its final form is late. J. W. Etheridge translated it into English in 1862–1865.",
    "talmud": "The Babylonian Talmud is the Mishnah, the Jewish oral law set down by Rabbi Judah the Prince around 200, with the Gemara, the discussion of it in the academies of Babylonia over the next three centuries, edited by about 600. It is the foundation of rabbinic Judaism, and it is a witness to how Jews of the early centuries read the Scriptures.",
    # Commentaries
    "henry": "Matthew Henry, a Nonconformist minister in Chester and then Hackney, wrote his Exposition of the Old and New Testaments from 1704 until his death in 1714, when he had reached the end of Acts. Thirteen ministers finished it from his notes. Spurgeon advised every minister to read it through at least once, and it has never been out of print.",
    "jfb": "Robert Jamieson and David Brown, Scottish ministers, and Andrew Robert Fausset, an Anglican clergyman, wrote their Commentary, Critical, Experimental and Practical, in six volumes (1864–1870), and the shorter edition here in 1871. It joined careful scholarship to devotion and became one of the most used commentaries of the evangelical world.",
    "clarke": "Adam Clarke, an Irish Methodist preacher and a gifted linguist, gave about forty years to his commentary on the whole Bible, published in eight volumes from 1810 to 1826. It was the standard Methodist commentary for a century.",
    "barnes": "Albert Barnes, a Presbyterian pastor in Philadelphia, wrote his Notes in the early mornings before his day's work, for Sunday school teachers and families. Published from 1832, they were read widely in America and Britain.",
    "wesley": "John Wesley, the founder of Methodism, wrote his Explanatory Notes upon the New Testament in 1754, while he was ill and resting from his travels, for \"plain, unlettered men\"; it was published in 1755, with much drawn from Bengel's Gnomon. His notes on the Old Testament followed in 1765. The Notes became one of the Methodist standards of doctrine.",
    "kd": "Carl Friedrich Keil and Franz Delitzsch, German Lutheran scholars, published their Biblical Commentary on the Old Testament from 1861 to 1875, and it was translated into English by T. & T. Clark in Edinburgh. Learned in the Hebrew and reverent towards Scripture, it is still a standard commentary.",
    "tdavid": "Charles Haddon Spurgeon wrote The Treasury of David, his commentary on the Psalms, over twenty years, from 1865 to 1885, first in his magazine The Sword and the Trowel. With his own exposition he gathered sayings on each verse from writers of every age, and hints for preachers.",
    "scofield": "Cyrus Ingerson Scofield, a lawyer who came to faith and became a Congregational minister, published the Scofield Reference Bible with Oxford University Press in 1909, and a revised edition in 1917. Its notes made dispensational teaching widely known, and it was one of the most influential Bibles of the twentieth century.",
    "tsk": "The Treasury of Scripture Knowledge gathers the cross-references from the margins of many earlier Bibles, chiefly those of John Canne, Samuel Browne, Benjamin Blayney and Thomas Scott. Samuel Bagster published it in London in the 1830s, and it has been reprinted ever since, letting Scripture explain Scripture.",
    "openbible_xref": "OpenBible.info, run by Stephen Smith, publishes Bible data free for anyone to use. Its cross-references began with those of the Treasury of Scripture Knowledge and others, and readers' votes on which help most rank them.",
    # Dictionaries and lexicons
    "strong": "James Strong, a Methodist professor at Drew Theological Seminary, led over a hundred helpers for more than thirty years to make his Exhaustive Concordance of the Bible (1890), listing every word of the King James Version. His Hebrew and Chaldee and Greek dictionaries gave each original word a number, and those numbers became the common key to the Bible's languages.",
    "kjc": "Concordances of the English Bible go back to Alexander Cruden's of 1737, made by hand. This one is counted by the computer from the King James Version with Strong's numbers, in the way Strong's Exhaustive Concordance (1890) first arranged the English words under the Hebrew and Greek.",
    "bdb_unabridged": "Francis Brown, S. R. Driver and Charles Briggs began in 1891 to revise Edward Robinson's translation of Wilhelm Gesenius' Hebrew lexicon; it grew into a new work, published in parts by the Clarendon Press, Oxford, and completed in 1906. For a century it was the standard Hebrew lexicon in English.",
    "abbott": "George Abbott-Smith, a Canadian Anglican scholar at Montreal, published his Manual Greek Lexicon of the New Testament in 1922. It used the papyri found in Egypt, which showed the New Testament's Greek to be the everyday Greek of its time, and the Septuagint's use of each word.",
    "easton": "Matthew George Easton, a Scottish Presbyterian minister, published his Illustrated Bible Dictionary in 1893, and a third edition in 1897, a short and clear reference for the general reader.",
    "smith": "William Smith, the English classical scholar, edited A Dictionary of the Bible (1860–1863), written by many of the best scholars of the day. Its shorter edition, here, became one of the most widely used Bible dictionaries.",
    "isbe": "The International Standard Bible Encyclopaedia was edited by James Orr with many scholars and published in five volumes in 1915, defending the Bible's history and teaching against the critics of the day. It was revised in 1929.",
    "nave": "Orville J. Nave, an army chaplain, spent fourteen years arranging the Bible by subject, and published Nave's Topical Bible in 1896: more than 20,000 topics with the verses on each.",
    "torrey": "Reuben Archer Torrey, evangelist and the first superintendent of the Moody Bible Institute, compiled his New Topical Text Book in 1897, to help Christians find what the Bible says on each subject.",
    "hitchcock": "Roswell D. Hitchcock, president of Union Theological Seminary in New York, included this dictionary of the meanings of the Bible's proper names in his Complete Analysis of the Holy Bible (1869).",
    "webster1828": "Noah Webster spent over twenty years on his American Dictionary of the English Language, published in 1828, with some 70,000 words. A devout Christian, he drew many of his definitions and examples from the Bible, and it records the English of the King James Version's readers.",
    "places": "OpenBible.info, run by Stephen Smith, publishes its Bible geocoding data freely: every place named in the Bible, with the sites scholars identify it with and how sure each identification is.",
    "maps": "These maps were drawn for Two-edged Sword from OpenBible.info's geocoding data and modern terrain data, in the tradition of the historical atlases printed in Bibles since the Geneva Bible of 1560.",
    # Books and devotionals
    "josephus": "Flavius Josephus, born in Jerusalem in 37, a priest and a commander in the Jewish revolt, went over to the Romans and wrote in Rome under the Flavian emperors: The Jewish War (about 75), the Antiquities of the Jews (93–94), his Life and Against Apion. William Whiston, Newton's successor at Cambridge, translated them in 1737, and his translation was in many English homes beside the Bible.",
    "edersheim": "Alfred Edersheim, born a Jew in Vienna, came to faith in Christ in Hungary and became a minister in Scotland and England. His Life and Times of Jesus the Messiah (1883) uses his knowledge of Jewish life and writings to set the Gospels in their world.",
    "foxe": "John Foxe, an English clergyman in exile under Mary I, gathered the stories of those who had died for their faith. His Acts and Monuments (1563), known as Foxe's Book of Martyrs, was set beside the Bible in English churches. William Byron Forbush edited this shorter version in 1926.",
    "pilgrim": "John Bunyan, a tinker and Baptist preacher of Bedford, wrote The Pilgrim's Progress while in prison for preaching without a licence. The first part was published in 1678 and the second in 1684. It has been translated into more languages than almost any book but the Bible.",
    "lawrence": "Brother Lawrence (Nicolas Herman), a lay brother of the Carmelites in Paris who worked in the kitchen, learned to live in constant awareness of God. After his death in 1691, Joseph de Beaufort gathered his conversations and letters into this little book (1692).",
    "bounds": "Edward McKendree Bounds, a Methodist minister and Confederate chaplain in the American Civil War, rose at four each morning to pray for three hours. His books on prayer were mostly published after his death in 1913, edited by Homer W. Hodge.",
    "sheldon": "Charles M. Sheldon, a Congregational minister in Topeka, Kansas, read this story to his Sunday evening congregation a chapter a week in 1896, and it was published in 1897. Its question, \"What would Jesus do?\", has been asked by millions of readers since.",
    "strong_theology": "Augustus Hopkins Strong, a Baptist pastor and for forty years president of Rochester Theological Seminary, first published his Systematic Theology in 1886, and in its final three-volume form in 1907–1909. It became a standard textbook of Baptist theology.",
    "sme": "Charles Haddon Spurgeon, pastor of the Metropolitan Tabernacle in London, published Morning by Morning in 1865 and Evening by Evening in 1868: a short reading for each morning and evening of the year, each opening a verse. Combined as Morning and Evening, they have been read daily by Christians ever since.",
    "daily": "Daily Light on the Daily Path was compiled by Jonathan Bagster and his family, of the Bible publishers Samuel Bagster and Sons, and first published in 1875. It is Scripture alone: for each morning and evening, verses gathered round one theme, in the words of the King James Version.",
    # Clarence Larkin's books
    "larkin_dispensational_truth": "Clarence Larkin, a mechanical draughtsman who became a Baptist pastor in Pennsylvania, drew large charts to teach Bible prophecy. Dispensational Truth (1918, enlarged in 1920) gathered his charts and teaching on God's plan through the ages, and became his best-known book.",
    "larkin_revelation": "Clarence Larkin, a mechanical draughtsman who became a Baptist pastor in Pennsylvania, drew large charts to teach Bible prophecy. The Book of Revelation (1919) expounds the book with his charts.",
    "larkin_daniel": "Clarence Larkin, a mechanical draughtsman who became a Baptist pastor in Pennsylvania, drew large charts to teach Bible prophecy. The Book of Daniel was published in 1929, after his death in 1924.",
    "larkin_second_coming": "Clarence Larkin, a mechanical draughtsman who became a Baptist pastor in Pennsylvania, drew large charts to teach Bible prophecy. The Second Coming of Christ (1918) sets out his teaching on the Lord's return.",
    "larkin_spirit_world": "Clarence Larkin, a mechanical draughtsman who became a Baptist pastor in Pennsylvania, drew large charts to teach Bible prophecy. The Spirit World (1921) is his study of what the Bible says of angels, demons and the life after death.",
    "larkin_rightly_dividing": "Clarence Larkin, a mechanical draughtsman who became a Baptist pastor in Pennsylvania, drew large charts to teach Bible prophecy. Rightly Dividing the Word (1921) is his guide to reading the Bible by its dispensations and covenants.",
}

HEAD = "<p><b>History.</b> "
OLD = re.compile(r"<p><b>History\.</b> .*?</p>", re.S)


def key(stem):
    """HISTORY's key for a module's file name (without its extension): a "+" edition's is its plain one's."""
    stem = stem.removesuffix("+")
    return "talmud" if stem.startswith("talmud_") else stem


def with_history(file, info):
    """A module's description with its history, after the first paragraph that isn't its cover; replacing one put
    there before. Unchanged if HISTORY hasn't the module."""
    text = HISTORY.get(key(Path(file).stem))
    if not text:
        return info
    info = OLD.sub("", info or "")
    para = f"{HEAD}{text}</p>"
    for m in re.finditer(r"<p\b[^>]*>(.*?)</p>", info, re.S):
        if m[1].strip() and not re.match(r"\s*<img ", m[1]):
            return info[:m.end()] + para + info[m.end():]
    return info + para


def apply(folder):
    """Adds or replaces the history in each module in `folder` that HISTORY has one for."""
    for p in sorted(Path(folder).iterdir()):
        if p.suffix not in (".bbli", ".cmti", ".dcti", ".lexi", ".refi", ".devi") or key(p.stem) not in HISTORY:
            continue
        db = sqlite3.connect(p)
        (info,) = db.execute("SELECT Information FROM Details").fetchone()
        new = with_history(p.name, info)
        if new != info:
            db.execute("UPDATE Details SET Information = ?", (new,))
            db.commit()
            print(f"  {p.name}")
        db.close()


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "apply":
        apply(sys.argv[2])
    else:
        sys.exit(__doc__)
