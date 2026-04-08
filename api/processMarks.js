// api/processMarks.js

export default function handler(req, res) {
    // Frontend (app.js) එකෙන් එවන දත්ත POST ක්‍රමය හරහා ලබා ගැනීම
    if (req.method === 'POST') {
        const { rawData, isALevelReport } = req.body;

        let studentsArray = Array.isArray(rawData) ? rawData : Object.keys(rawData).map(key => ({
            admNo: key,
            ...rawData[key]
        }));

        // Total සහ Average ගණනය කිරීම
        let processedStudents = studentsArray.map(student => {
            let total = 0;
            let subjectsCount = 0;
            
            if (student.marks) {
                for (let sub in student.marks) {
                    if (typeof student.marks[sub] === 'number') {
                        total += student.marks[sub];
                        subjectsCount++;
                    }
                }
            }
            
            student.total = total;
            student.average = subjectsCount > 0 ? parseFloat((total / subjectsCount).toFixed(2)) : 0;
            return student;
        });

        // පන්තියේ මධ්‍යන්‍යය (Mean) සහ විචලතාව (Variance) සෙවීම
        let n = processedStudents.length;
        let classTotal = processedStudents.reduce((sum, s) => sum + s.average, 0);
        let mean = n > 0 ? classTotal / n : 0;
        
        let variance = processedStudents.reduce((sum, s) => sum + Math.pow(s.average - mean, 2), 0) / n;
        let stdDev = Math.sqrt(variance);

        // Z-Score සහ Rank ගණනය කිරීම
        processedStudents = processedStudents.map(student => {
            student.overallZ = stdDev > 0 ? parseFloat(((student.average - mean) / stdDev).toFixed(4)) : 0;
            return student;
        });

        // ලකුණු අනුව පෙළගැස්වීම (Sort)
        processedStudents.sort((a, b) => b.total - a.total); 
        
        // Rank (ස්ථානය) ලබා දීම
        let currentRank = 1;
        processedStudents.forEach((student, index) => {
            if (index > 0 && student.total === processedStudents[index - 1].total) {
                student.rank = processedStudents[index - 1].rank;
            } else {
                student.rank = currentRank;
            }
            currentRank++;
        });

        // සකසන ලද අවසන් ප්‍රතිඵල නැවත Frontend (app.js) එකට යැවීම
        res.status(200).json({
            reportArray: processedStudents,
            isALevelReport: isALevelReport
        });
        
    } else {
        // වැරදි ක්‍රමයකින් කවුරුහරි Data ඉල්ලුවොත් Error එකක් යැවීම
        res.status(405).json({ message: 'Only POST requests are allowed' });
    }
}